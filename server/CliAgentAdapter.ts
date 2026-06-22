import { spawn } from 'node:child_process'
import {
  CLI_AGENT_SPECS,
  type CliAgentKind,
  type PromptDelivery,
} from '../src/domain/agents'
import type {
  AgentCliAdapter,
  AgentCommandConfig,
  AgentConnectionResponse,
  AgentRunRequest,
  AgentRunResponse,
} from '../src/domain/types'

const maxOutputBytes = 2 * 1024 * 1024

export interface CliAgentRunRequest extends AgentRunRequest {
  agentKind: CliAgentKind
  commandConfig: AgentCommandConfig
  timeoutMs: number
}

const parseArguments = (
  input: string,
): { args: string[] } | { error: string } => {
  if (input.length > 2_000) return { error: 'エージェント引数が長すぎます。' }
  if (/[\0\r\n]/.test(input)) {
    return { error: 'エージェント引数に不正な文字が含まれています。' }
  }

  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const character of input.trim()) {
    if (escaping) {
      current += character
      escaping = false
    } else if (character === '\\' && quote !== "'") {
      escaping = true
    } else if (quote) {
      if (character === quote) quote = null
      else current += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (/\s/.test(character)) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += character
    }
  }

  if (escaping || quote) {
    return { error: 'エージェント引数の引用符またはエスケープが閉じていません。' }
  }
  if (current) args.push(current)
  return { args }
}

export class CliAgentAdapter implements AgentCliAdapter<CliAgentRunRequest> {
  async check(
    commandConfig: AgentCommandConfig,
    agentKind: CliAgentKind,
    timeoutMs = 10_000,
  ): Promise<AgentConnectionResponse> {
    const label = CLI_AGENT_SPECS[agentKind].label
    const parsedArgs = parseArguments(commandConfig.codexArgs)
    if ('error' in parsedArgs) {
      return {
        success: false,
        command: commandConfig.codexCommand,
        args: commandConfig.codexArgs,
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: parsedArgs.error,
      }
    }

    return new Promise((resolveResult) => {
      const startedAt = Date.now()
      const child = spawn(commandConfig.codexCommand, ['--version'], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = (stdout + chunk.toString('utf8')).slice(-maxOutputBytes)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-maxOutputBytes)
      })

      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)
      const finish = (exitCode: number | null, error?: string) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        const version = stdout.trim() || stderr.trim()
        resolveResult({
          success: !timedOut && !error && exitCode === 0,
          command: commandConfig.codexCommand,
          args: commandConfig.codexArgs,
          version: version || undefined,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          error,
        })
      }
      child.on('error', (error) => {
        finish(null, `${label}を開始できませんでした: ${error.message}`)
      })
      child.on('close', (exitCode) => {
        finish(
          exitCode,
          timedOut
            ? `${label}の疎通確認が${Math.round(timeoutMs / 1_000)}秒でタイムアウトしました。`
            : exitCode === 0
              ? undefined
              : `${label}が終了コード${exitCode ?? '不明'}を返しました。`,
        )
      })
    })
  }

  async run(request: CliAgentRunRequest): Promise<AgentRunResponse> {
    const { agentKind } = request
    const spec = CLI_AGENT_SPECS[agentKind]
    const label = spec.label
    const promptDelivery: PromptDelivery = spec.promptDelivery
    const parsedArgs = parseArguments(request.commandConfig.codexArgs)
    if ('error' in parsedArgs) {
      return {
        agentKind,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: parsedArgs.error,
      }
    }

    // 作業ディレクトリを引数で明示するCLI（OpenCodeの --dir など）向けに
    // [flag, repositoryPath] を注入する。
    const baseArgs = spec.repoPathFlag
      ? [...parsedArgs.args, spec.repoPathFlag, request.repositoryPath]
      : parsedArgs.args
    // promptDelivery が 'arg' の場合はプロンプトを末尾の引数として渡し、
    // 'stdin' の場合は標準入力へ流し込む。
    const spawnArgs =
      promptDelivery === 'arg' ? [...baseArgs, request.prompt] : baseArgs

    return new Promise((resolveResult) => {
      const startedAt = Date.now()
      const child = spawn(request.commandConfig.codexCommand, spawnArgs, {
        cwd: request.repositoryPath,
        // $PWD を信頼して作業先を決めるCLIに備え、cwdと揃えておく。
        env: { ...process.env, PWD: request.repositoryPath },
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false

      const appendOutput = (current: string, chunk: Buffer): string =>
        (current + chunk.toString('utf8')).slice(-maxOutputBytes)

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = appendOutput(stdout, chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = appendOutput(stderr, chunk)
      })

      // stdin avoids shell interpolation and keeps long prompts out of the
      // process argument list. agentArgs selects the desired CLI mode.
      child.stdin.on('error', () => {
        // Some CLI modes close stdin after producing their own error output.
      })
      // 'arg' 配送でもstdinはすぐ閉じる（CLIがTTY待ちにならないように）。
      child.stdin.end(promptDelivery === 'stdin' ? request.prompt : '')

      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!settled) child.kill('SIGKILL')
        }, 1_000).unref()
      }, request.timeoutMs)

      const finish = (exitCode: number | null, error?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolveResult({
          agentKind,
          success: !timedOut && !error && exitCode === 0,
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          error,
        })
      }

      child.on('error', (error) => {
        finish(null, `${label}を開始できませんでした: ${error.message}`)
      })
      child.on('close', (exitCode) => {
        finish(
          exitCode,
          timedOut
            ? `${label}が${Math.round(request.timeoutMs / 1_000)}秒でタイムアウトしました。`
            : undefined,
        )
      })
    })
  }
}
