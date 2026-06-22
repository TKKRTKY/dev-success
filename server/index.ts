import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import express from 'express'
import { getGitDiffRiskLevel, parseGitDiffInput } from '../src/gitDiffParser'
import { parseVerificationResult } from '../src/verificationParser'
import { parseThinkAgentResponse } from '../src/thinkAgentParser'
import { buildSetupParsePrompt } from '../src/setupPromptBuilder'
import { parseSetupResponse } from '../src/setupResponseParser'
import { DEFAULT_AGENT_TIMEOUT_MS } from '../src/domain/projectConfig'
import {
  CLI_AGENT_SPECS,
  isCliAgentKind,
  type CliAgentKind,
} from '../src/domain/agents'
import { CliAgentAdapter } from './CliAgentAdapter'
import type {
  AgentKind,
  AgentConnectionResponse,
  AgentRunResponse,
  FeatureSeedOption,
  ProjectConfig,
  RepositoryDiff,
  RepositoryStatus,
  SetupParseResponse,
  ThinkAgentResponse,
  VerificationType,
  VerifyRepositoryResponse,
} from '../src/domain/types'

const app = express()
const host = '127.0.0.1'
const port = 3001
const verificationTypes: VerificationType[] = [
  'test',
  'lint',
  'typecheck',
  'build',
]
const allowedVerificationCommands = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'npx',
  'bundle',
  'bin/rails',
  'rails',
])
const forbiddenCommandTokens = new Set([
  'rm',
  'sudo',
  'curl',
  'wget',
  'ssh',
  'scp',
])
const maxVerificationOutputBytes = 1024 * 1024
const maxAgentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS
const cliAgentAdapter = new CliAgentAdapter()

app.use(express.json({ limit: '256kb' }))

// body.agentKind からCLIエージェント種別を決定する。未指定や不正値は
// codex とみなし、後方互換を保つ。
const resolveCliAgentKind = (body: Record<string, unknown>): CliAgentKind => {
  const candidate =
    typeof body.agentKind === 'string' ? body.agentKind : 'codex'
  return isCliAgentKind(candidate) ? candidate : 'codex'
}

// codexCommand / codexArgs は履歴的な名称だが、選択中エージェントの
// 汎用コマンド・引数として扱う。許可するコマンド名はエージェントごとに
// 異なるため、specのallowedCommandBasenamesで検証する。
const parseAgentCommandConfig = (
  body: Record<string, unknown>,
  agentKind: CliAgentKind,
): { codexCommand: string; codexArgs: string } | { error: string } => {
  const spec = CLI_AGENT_SPECS[agentKind]
  const codexCommand =
    typeof body.codexCommand === 'string' && body.codexCommand.trim()
      ? body.codexCommand.trim()
      : spec.defaultCommand
  const codexArgs =
    typeof body.codexArgs === 'string'
      ? body.codexArgs.trim() || spec.defaultArgs
      : spec.defaultArgs

  if (
    !codexCommand ||
    /[\0\r\n\s]/.test(codexCommand) ||
    (!isAbsolute(codexCommand) && codexCommand !== spec.defaultCommand) ||
    !spec.allowedCommandBasenames.includes(basename(codexCommand).toLowerCase())
  ) {
    return {
      error: `コマンドは「${spec.defaultCommand}」、または${spec.label}実行ファイルへの絶対パスを指定してください。`,
    }
  }
  return { codexCommand, codexArgs }
}

const emptyStatus = (
  overrides: Partial<RepositoryStatus> = {},
): RepositoryStatus => ({
  exists: false,
  isDirectory: false,
  isGitRepository: false,
  changedFiles: [],
  ...overrides,
})

const emptyDiff = (
  overrides: Partial<RepositoryDiff> = {},
): RepositoryDiff => ({
  changedFiles: [],
  nameOnlyText: '',
  statText: '',
  insertions: 0,
  deletions: 0,
  fileCount: 0,
  riskLevel: 'low',
  ...overrides,
})

const runGit = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolveOutput, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 5_000,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }

        resolveOutput(stdout)
      },
    )
  })

const emptyAgentResponse = (
  agentKind: AgentKind,
  overrides: Partial<AgentRunResponse> = {},
): AgentRunResponse => ({
  agentKind,
  success: false,
  exitCode: null,
  stdout: '',
  stderr: '',
  durationMs: 0,
  ...overrides,
})

const getChangedFile = (statusLine: string): string => {
  const filePart = statusLine.slice(3).trim()
  const renamedFile = filePart.split(' -> ').at(-1)
  return renamedFile ?? filePart
}

const parseVerificationCommand = (
  command: string,
): { commandName: string; args: string[] } | { error: string } => {
  const trimmedCommand = command.trim()
  if (!trimmedCommand) return { error: 'command is required.' }
  if (trimmedCommand.length > 500) {
    return { error: 'command is too long.' }
  }
  if (/[\n\r;&|><`$\\'"]/.test(trimmedCommand)) {
    return { error: 'シェル構文や引用符を含むコマンドは実行できません。' }
  }

  const [commandName, ...args] = trimmedCommand.split(/\s+/)
  if (!allowedVerificationCommands.has(commandName)) {
    return {
      error: `許可されていないコマンドです: ${commandName}`,
    }
  }
  if (
    args.some((arg) =>
      forbiddenCommandTokens.has(arg.replace(/^.*\//, '').toLowerCase()),
    )
  ) {
    return { error: '危険なコマンドを含むため実行できません。' }
  }

  return { commandName, args }
}

interface VerificationProcessResult {
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  error?: string
}

const runVerificationCommand = (
  cwd: string,
  commandName: string,
  args: string[],
): Promise<VerificationProcessResult> =>
  new Promise((resolveResult) => {
    const startedAt = Date.now()
    const child = spawn(commandName, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const appendOutput = (current: string, chunk: Buffer): string =>
      (current + chunk.toString('utf8')).slice(-maxVerificationOutputBytes)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk)
    })

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL')
      }, 1_000).unref()
    }, 60_000)

    const finish = (
      exitCode: number | null,
      error?: string,
    ): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolveResult({
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        error,
      })
    }

    child.on('error', (error) => {
      finish(null, `コマンドを開始できませんでした: ${error.message}`)
    })
    child.on('close', (exitCode) => {
      finish(
        exitCode,
        timedOut ? '確認コマンドが60秒でタイムアウトしました。' : undefined,
      )
    })
  })

app.get('/api/repository/status', async (request, response) => {
  const inputPath =
    typeof request.query.path === 'string' ? request.query.path.trim() : ''

  if (!inputPath) {
    response
      .status(400)
      .json(emptyStatus({ error: 'path query parameter is required.' }))
    return
  }

  const repositoryPath = resolve(inputPath)
  let pathStat

  try {
    pathStat = await stat(repositoryPath)
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined

    if (errorCode === 'ENOENT') {
      response.json(
        emptyStatus({ error: '指定されたパスは存在しません。' }),
      )
      return
    }

    response.status(400).json(
      emptyStatus({
        error:
          error instanceof Error
            ? `パスを確認できませんでした: ${error.message}`
            : 'パスを確認できませんでした。',
      }),
    )
    return
  }

  if (!pathStat.isDirectory()) {
    response.status(400).json(
      emptyStatus({
        exists: true,
        error: '指定されたパスはディレクトリではありません。',
      }),
    )
    return
  }

  try {
    const isInsideWorkTree = (
      await runGit(repositoryPath, ['rev-parse', '--is-inside-work-tree'])
    ).trim()

    if (isInsideWorkTree !== 'true') {
      response.json(
        emptyStatus({
          exists: true,
          isDirectory: true,
          error: '指定されたディレクトリはGitリポジトリではありません。',
        }),
      )
      return
    }
  } catch {
    response.json(
      emptyStatus({
        exists: true,
        isDirectory: true,
        error: '指定されたディレクトリはGitリポジトリではありません。',
      }),
    )
    return
  }

  try {
    const [statusOutput, branchOutput] = await Promise.all([
      runGit(repositoryPath, ['status', '--short']),
      runGit(repositoryPath, ['branch', '--show-current']),
    ])
    const statusText = statusOutput.trimEnd()
    const changedFiles = statusText
      ? statusText.split(/\r?\n/).map(getChangedFile)
      : []

    response.json({
      exists: true,
      isDirectory: true,
      isGitRepository: true,
      currentBranch: branchOutput.trim() || undefined,
      changedFiles,
      statusText,
    } satisfies RepositoryStatus)
  } catch (error) {
    response.status(500).json(
      emptyStatus({
        exists: true,
        isDirectory: true,
        isGitRepository: true,
        error:
          error instanceof Error
            ? `Gitの状態を取得できませんでした: ${error.message}`
            : 'Gitの状態を取得できませんでした。',
      }),
    )
  }
})

app.post('/api/agent/check', async (request, response) => {
  const body =
    typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {}
  const agentKind = resolveCliAgentKind(body)
  const commandConfig = parseAgentCommandConfig(body, agentKind)
  if ('error' in commandConfig) {
    response.status(400).json({
      success: false,
      command: '',
      args: '',
      stdout: '',
      stderr: '',
      durationMs: 0,
      error: commandConfig.error,
    } satisfies AgentConnectionResponse)
    return
  }

  const result = await cliAgentAdapter.check(commandConfig, agentKind)
  response.status(result.success ? 200 : 502).json(result)
})

app.get('/api/repository/diff', async (request, response) => {
  const inputPath =
    typeof request.query.path === 'string' ? request.query.path.trim() : ''

  if (!inputPath) {
    response
      .status(400)
      .json(emptyDiff({ error: 'path query parameter is required.' }))
    return
  }

  const repositoryPath = resolve(inputPath)
  let pathStat

  try {
    pathStat = await stat(repositoryPath)
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined

    response.status(errorCode === 'ENOENT' ? 404 : 400).json(
      emptyDiff({
        error:
          errorCode === 'ENOENT'
            ? '指定されたパスは存在しません。'
            : error instanceof Error
              ? `パスを確認できませんでした: ${error.message}`
              : 'パスを確認できませんでした。',
      }),
    )
    return
  }

  if (!pathStat.isDirectory()) {
    response
      .status(400)
      .json(emptyDiff({ error: '指定されたパスはディレクトリではありません。' }))
    return
  }

  try {
    const isInsideWorkTree = (
      await runGit(repositoryPath, ['rev-parse', '--is-inside-work-tree'])
    ).trim()

    if (isInsideWorkTree !== 'true') {
      response
        .status(400)
        .json(emptyDiff({ error: '指定されたディレクトリはGitリポジトリではありません。' }))
      return
    }
  } catch {
    response
      .status(400)
      .json(emptyDiff({ error: '指定されたディレクトリはGitリポジトリではありません。' }))
    return
  }

  try {
    const [nameOnlyOutput, statOutput] = await Promise.all([
      runGit(repositoryPath, ['diff', '--name-only']),
      runGit(repositoryPath, ['diff', '--stat']),
    ])
    const nameOnlyText = nameOnlyOutput.trimEnd()
    const statText = statOutput.trimEnd()
    const changedFiles = nameOnlyText
      ? nameOnlyText.split(/\r?\n/).filter(Boolean)
      : []
    const parsedDiff = parseGitDiffInput(statText)
    const insertions = parsedDiff?.insertions ?? 0
    const deletions = parsedDiff?.deletions ?? 0
    const fileCount = changedFiles.length || parsedDiff?.fileCount || 0

    response.json({
      changedFiles,
      nameOnlyText,
      statText,
      insertions,
      deletions,
      fileCount,
      riskLevel: getGitDiffRiskLevel(fileCount, insertions, deletions),
    } satisfies RepositoryDiff)
  } catch (error) {
    response.status(500).json(
      emptyDiff({
        error:
          error instanceof Error
            ? `git diffを取得できませんでした: ${error.message}`
            : 'git diffを取得できませんでした。',
      }),
    )
  }
})

app.post('/api/repository/verify', async (request, response) => {
  const body =
    typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {}
  const inputPath = typeof body.path === 'string' ? body.path.trim() : ''
  const command = typeof body.command === 'string' ? body.command.trim() : ''
  const verificationType = body.verificationType

  if (
    typeof verificationType !== 'string' ||
    !verificationTypes.includes(verificationType as VerificationType)
  ) {
    response.status(400).json({ error: 'verificationType is invalid.' })
    return
  }
  const typedVerificationType = verificationType as VerificationType

  if (!inputPath) {
    response.status(400).json({ error: 'path is required.' })
    return
  }
  if (!command) {
    response.status(400).json({ error: 'command is required.' })
    return
  }

  const parsedCommand = parseVerificationCommand(command)
  if ('error' in parsedCommand) {
    response.status(400).json({ error: parsedCommand.error })
    return
  }

  const repositoryPath = resolve(inputPath)
  let pathStat

  try {
    pathStat = await stat(repositoryPath)
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined
    response.status(errorCode === 'ENOENT' ? 404 : 400).json({
      error:
        errorCode === 'ENOENT'
          ? '指定されたパスは存在しません。'
          : 'パスを確認できませんでした。',
    })
    return
  }

  if (!pathStat.isDirectory()) {
    response
      .status(400)
      .json({ error: '指定されたパスはディレクトリではありません。' })
    return
  }

  try {
    const isInsideWorkTree = (
      await runGit(repositoryPath, ['rev-parse', '--is-inside-work-tree'])
    ).trim()
    if (isInsideWorkTree !== 'true') {
      response
        .status(400)
        .json({ error: '指定されたディレクトリはGitリポジトリではありません。' })
      return
    }
  } catch {
    response
      .status(400)
      .json({ error: '指定されたディレクトリはGitリポジトリではありません。' })
    return
  }

  const processResult = await runVerificationCommand(
    repositoryPath,
    parsedCommand.commandName,
    parsedCommand.args,
  )
  const combinedOutput = [processResult.stdout, processResult.stderr]
    .filter(Boolean)
    .join('\n')
  const successfulExit =
    !processResult.timedOut &&
    !processResult.error &&
    processResult.exitCode === 0
  const parsedResult = parseVerificationResult({
    verificationType: typedVerificationType,
    command,
    output:
      combinedOutput ||
      (successfulExit ? 'command completed successfully' : 'command failed'),
    successOverride: successfulExit,
  })

  if (!parsedResult) {
    response.status(500).json({ error: '確認結果を解析できませんでした。' })
    return
  }

  response.json({
    verificationType: typedVerificationType,
    command,
    success: parsedResult.success,
    exitCode: processResult.exitCode,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    durationMs: processResult.durationMs,
    summaryText: parsedResult.summaryText,
    errorCount: parsedResult.errorCount,
    warningCount: parsedResult.warningCount,
    riskLevel: parsedResult.riskLevel,
    error: processResult.error,
  } satisfies VerifyRepositoryResponse)
})

app.post('/api/agent/run', async (request, response) => {
  const body =
    typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {}
  const rawAgentKind = body.agentKind

  if (
    rawAgentKind !== 'manual' &&
    (typeof rawAgentKind !== 'string' || !isCliAgentKind(rawAgentKind))
  ) {
    response
      .status(400)
      .json(
        emptyAgentResponse('other', {
          error:
            'agentKindはcodex / claude-code / opencode / manual のいずれかを指定してください。',
        }),
      )
    return
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    response
      .status(400)
      .json(
        emptyAgentResponse(rawAgentKind, { error: 'prompt is required.' }),
      )
    return
  }
  if (prompt.length > 200_000) {
    response
      .status(400)
      .json(
        emptyAgentResponse(rawAgentKind, { error: 'prompt is too long.' }),
      )
    return
  }

  if (rawAgentKind === 'manual') {
    response.json(
      emptyAgentResponse('manual', {
        stderr: 'manual agent does not execute automatically',
        error: 'manual agent does not execute automatically',
      }),
    )
    return
  }

  const agentKind: CliAgentKind = rawAgentKind

  const inputPath =
    typeof body.repositoryPath === 'string'
      ? body.repositoryPath.trim()
      : ''
  if (!inputPath) {
    response
      .status(400)
      .json(
        emptyAgentResponse(agentKind, {
          error: 'repositoryPath is required.',
        }),
      )
    return
  }

  const commandConfig = parseAgentCommandConfig(body, agentKind)
  const requestedTimeout =
    typeof body.agentTimeoutMs === 'number' &&
    Number.isFinite(body.agentTimeoutMs)
      ? Math.floor(body.agentTimeoutMs)
      : maxAgentTimeoutMs
  const timeoutMs = Math.min(
    maxAgentTimeoutMs,
    Math.max(1_000, requestedTimeout),
  )

  if ('error' in commandConfig) {
    response.status(400).json(
      emptyAgentResponse(agentKind, {
        error: commandConfig.error,
      }),
    )
    return
  }

  const repositoryPath = resolve(inputPath)
  let pathStat
  try {
    pathStat = await stat(repositoryPath)
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined
    response.status(errorCode === 'ENOENT' ? 404 : 400).json(
      emptyAgentResponse(agentKind, {
        error:
          errorCode === 'ENOENT'
            ? '指定されたパスは存在しません。'
            : 'パスを確認できませんでした。',
      }),
    )
    return
  }

  if (!pathStat.isDirectory()) {
    response.status(400).json(
      emptyAgentResponse(agentKind, {
        error: '指定されたパスはディレクトリではありません。',
      }),
    )
    return
  }

  try {
    const isInsideWorkTree = (
      await runGit(repositoryPath, ['rev-parse', '--is-inside-work-tree'])
    ).trim()
    if (isInsideWorkTree !== 'true') {
      response.status(400).json(
        emptyAgentResponse(agentKind, {
          error: '指定されたディレクトリはGitリポジトリではありません。',
        }),
      )
      return
    }
  } catch {
    response.status(400).json(
      emptyAgentResponse(agentKind, {
        error: '指定されたディレクトリはGitリポジトリではありません。',
      }),
    )
    return
  }

  const agentResult = await cliAgentAdapter.run({
    agentKind,
    repositoryPath,
    prompt,
    featureSeedId:
      typeof body.featureSeedId === 'string'
        ? body.featureSeedId
        : undefined,
    commandConfig: {
      codexCommand: commandConfig.codexCommand,
      codexArgs: commandConfig.codexArgs,
    },
    timeoutMs,
  })

  response.json(agentResult)
})

app.post('/api/setup/parse', async (request, response) => {
  const body =
    typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {}
  const rawInput =
    typeof body.rawInput === 'string' ? body.rawInput.trim() : ''
  const currentFormValues =
    typeof body.currentFormValues === 'object' &&
    body.currentFormValues !== null
      ? (body.currentFormValues as Partial<ProjectConfig>)
      : undefined
  const scenarioMaxTurn =
    typeof body.scenarioMaxTurn === 'number' &&
    Number.isFinite(body.scenarioMaxTurn)
      ? body.scenarioMaxTurn
      : undefined

  const fail = (
    error: string,
    rawOutput = '',
    status = 400,
  ): void => {
    response.status(status).json({
      success: false,
      assistantMessage:
        '下書きを生成できませんでした。既存フォームは変更していません。手動でフォーム入力できます。',
      rawOutput,
      error,
    } satisfies SetupParseResponse)
  }

  if (!rawInput) {
    fail('作りたいものの説明を入力してください。')
    return
  }
  if (rawInput.length > 50_000) {
    fail('入力が長すぎます。50,000文字以内にしてください。')
    return
  }
  // 初期設定の整理は、設定済みの実行エージェント（manualならcodexへ
  // フォールバック）で行う。
  const setupAgentKind: CliAgentKind =
    typeof currentFormValues?.defaultAgent === 'string' &&
    isCliAgentKind(currentFormValues.defaultAgent)
      ? currentFormValues.defaultAgent
      : 'codex'
  const setupSpec = CLI_AGENT_SPECS[setupAgentKind]
  const commandConfig = parseAgentCommandConfig(
    {
      codexCommand:
        currentFormValues?.agentCommandConfig?.codexCommand ??
        setupSpec.defaultCommand,
      codexArgs:
        currentFormValues?.agentCommandConfig?.codexArgs ??
        setupSpec.defaultArgs,
    },
    setupAgentKind,
  )
  const requestedTimeout =
    typeof currentFormValues?.agentTimeoutMs === 'number' &&
    Number.isFinite(currentFormValues.agentTimeoutMs)
      ? Math.floor(currentFormValues.agentTimeoutMs)
      : maxAgentTimeoutMs
  const timeoutMs = Math.min(
    maxAgentTimeoutMs,
    Math.max(1_000, requestedTimeout),
  )

  if ('error' in commandConfig) {
    fail(commandConfig.error)
    return
  }

  const prompt = buildSetupParsePrompt({
    rawInput,
    currentFormValues,
    scenarioMaxTurn,
  })
  let temporaryDirectory = ''
  let agentResult: AgentRunResponse
  try {
    // 初期設定の整理では対象リポジトリを触らせない。一時Git
    // ディレクトリでエージェントを実行し、終了後に内容ごと削除する。
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'dev-success-setup-'),
    )
    await runGit(temporaryDirectory, ['init'])
    agentResult = await cliAgentAdapter.run({
      agentKind: setupAgentKind,
      repositoryPath: temporaryDirectory,
      prompt,
      commandConfig,
      timeoutMs,
    })
  } catch (error) {
    fail(
      error instanceof Error
        ? `AI下書き用の実行環境を準備できませんでした: ${error.message}`
        : 'AI下書き用の実行環境を準備できませんでした。',
      '',
      500,
    )
    return
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      )
    }
  }
  const rawOutput = agentResult.stdout || agentResult.stderr
  if (!agentResult.success) {
    fail(
      agentResult.error ||
        `${setupSpec.label}が終了コード${agentResult.exitCode ?? '不明'}で終了しました。`,
      rawOutput,
      502,
    )
    return
  }

  try {
    response.json(parseSetupResponse(rawOutput))
  } catch (error) {
    fail(
      error instanceof Error
        ? `AI出力を解析できませんでした: ${error.message}`
        : 'AI出力を解析できませんでした。',
      rawOutput,
      502,
    )
  }
})

app.post('/api/agent/think', async (request, response) => {
  const body =
    typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {}
  const rawAgentKind = body.agentKind
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const inputPath =
    typeof body.repositoryPath === 'string'
      ? body.repositoryPath.trim()
      : ''
  const plannedTitles = Array.isArray(body.plannedTitles)
    ? body.plannedTitles.filter(
        (title): title is string => typeof title === 'string',
      )
    : []
  const fallbackOptions = Array.isArray(body.fallbackOptions)
    ? body.fallbackOptions
    : []

  const fail = (error: string, rawOutput = ''): ThinkAgentResponse => ({
    success: false,
    options: [],
    rawOutput,
    error,
  })

  if (rawAgentKind === 'manual') {
    response.json(fail('manual agent does not execute automatically'))
    return
  }
  if (typeof rawAgentKind !== 'string' || !isCliAgentKind(rawAgentKind)) {
    response
      .status(400)
      .json(
        fail(
          '考えるAI生成は codex / claude-code / opencode のいずれかで実行できます。',
        ),
      )
    return
  }
  const agentKind: CliAgentKind = rawAgentKind
  if (!prompt) {
    response.status(400).json(fail('prompt is required.'))
    return
  }
  if (prompt.length > 200_000) {
    response.status(400).json(fail('prompt is too long.'))
    return
  }
  if (!inputPath) {
    response
      .status(400)
      .json(fail('リポジトリパスが設定されていません。'))
    return
  }

  const commandConfig = parseAgentCommandConfig(body, agentKind)
  const requestedTimeout =
    typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs)
      ? Math.floor(body.timeoutMs)
      : maxAgentTimeoutMs
  const timeoutMs = Math.min(
    maxAgentTimeoutMs,
    Math.max(1_000, requestedTimeout),
  )

  if ('error' in commandConfig) {
    response.status(400).json(fail(commandConfig.error))
    return
  }

  const repositoryPath = resolve(inputPath)
  let pathStat
  try {
    pathStat = await stat(repositoryPath)
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error ? error.code : undefined
    response
      .status(errorCode === 'ENOENT' ? 404 : 400)
      .json(
        fail(
          errorCode === 'ENOENT'
            ? '指定されたパスは存在しません。'
            : 'パスを確認できませんでした。',
        ),
      )
    return
  }
  if (!pathStat.isDirectory()) {
    response
      .status(400)
      .json(fail('指定されたパスはディレクトリではありません。'))
    return
  }
  try {
    const isInsideWorkTree = (
      await runGit(repositoryPath, ['rev-parse', '--is-inside-work-tree'])
    ).trim()
    if (isInsideWorkTree !== 'true') {
      response
        .status(400)
        .json(fail('指定されたディレクトリはGitリポジトリではありません。'))
      return
    }
  } catch {
    response
      .status(400)
      .json(fail('指定されたディレクトリはGitリポジトリではありません。'))
    return
  }

  const agentResult = await cliAgentAdapter.run({
    agentKind,
    repositoryPath,
    prompt,
    commandConfig,
    timeoutMs,
  })
  const rawOutput = agentResult.stdout || agentResult.stderr
  if (!agentResult.success) {
    response.json(
      fail(
        agentResult.error ||
          `${CLI_AGENT_SPECS[agentKind].label}が終了コード${agentResult.exitCode ?? '不明'}で終了しました。`,
        rawOutput,
      ),
    )
    return
  }

  try {
    const parsed = parseThinkAgentResponse(
      rawOutput,
      plannedTitles,
      fallbackOptions as FeatureSeedOption[],
    )
    response.json({
      success: true,
      options: parsed.options,
      rawOutput,
      source: parsed.source,
      warnings: parsed.warnings,
    } satisfies ThinkAgentResponse)
  } catch (error) {
    response.json(
      fail(
        error instanceof Error
          ? `AI出力を解析できませんでした: ${error.message}`
          : 'AI出力を解析できませんでした。',
        rawOutput,
      ),
    )
  }
})

app.listen(port, host, () => {
  console.log(`Repository API listening on http://${host}:${port}`)
})
