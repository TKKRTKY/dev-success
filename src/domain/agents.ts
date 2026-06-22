import type { AgentCommandConfig, AgentKind } from './types'

// 自動実行に対応するCLIエージェント種別。AgentKindのうち、backendが
// 実際にコマンドを起動できるものだけをここで扱う。
export type CliAgentKind = 'codex' | 'claude-code' | 'opencode'

// プロンプトの渡し方。stdinは標準入力へ流し込み、argは最後の引数として渡す。
export type PromptDelivery = 'stdin' | 'arg'

export interface CliAgentSpec {
  kind: CliAgentKind
  label: string
  defaultCommand: string
  defaultArgs: string
  // 許可するコマンドのbasename（小文字、Windowsの.exe込み）。
  // 任意パスを与えても、ここに無い実行ファイルは拒否する。
  allowedCommandBasenames: string[]
  promptDelivery: PromptDelivery
  // 設定UIの引数入力に表示するプレースホルダー。
  argsPlaceholder: string
  // 作業ディレクトリを引数で明示するためのフラグ名（例: '--dir'）。
  // 指定された場合、adapterは [flag, repositoryPath] を引数へ注入する。
  // OpenCodeのように、spawnのcwdではなく$PWDなどで作業先を決めるCLI向け。
  repoPathFlag?: string
}

export const CLI_AGENT_SPECS: Record<CliAgentKind, CliAgentSpec> = {
  codex: {
    kind: 'codex',
    label: 'Codex CLI',
    defaultCommand: 'codex',
    defaultArgs: 'exec -',
    allowedCommandBasenames: ['codex', 'codex.exe'],
    promptDelivery: 'stdin',
    argsPlaceholder: '例: exec -',
  },
  'claude-code': {
    kind: 'claude-code',
    label: 'Claude Code',
    defaultCommand: 'claude',
    // -p で非対話モード、acceptEdits で確認なしにファイル変更を適用する。
    // プロンプトは標準入力から読み取られる。
    defaultArgs: '-p --permission-mode acceptEdits',
    allowedCommandBasenames: ['claude', 'claude.exe'],
    promptDelivery: 'stdin',
    argsPlaceholder: '例: -p --permission-mode acceptEdits',
  },
  opencode: {
    kind: 'opencode',
    label: 'OpenCode',
    defaultCommand: 'opencode',
    // `opencode run <message>` が非対話実行の形式。プロンプトは最後の
    // 引数として渡す。
    defaultArgs: 'run',
    allowedCommandBasenames: ['opencode', 'opencode.exe'],
    promptDelivery: 'arg',
    argsPlaceholder: '例: run',
    // OpenCodeはspawnのcwdを無視し$PWD等で作業先を決めるため、
    // --dir で対象リポジトリを明示する。
    repoPathFlag: '--dir',
  },
}

export const CLI_AGENT_KINDS = Object.keys(CLI_AGENT_SPECS) as CliAgentKind[]

// 設定UIに並べるエージェント候補（自動実行対応 + manual）。
export const SELECTABLE_AGENT_KINDS: AgentKind[] = [
  ...CLI_AGENT_KINDS,
  'manual',
]

export const isCliAgentKind = (kind: string): kind is CliAgentKind =>
  Object.prototype.hasOwnProperty.call(CLI_AGENT_SPECS, kind)

export const getCliAgentSpec = (kind: CliAgentKind): CliAgentSpec =>
  CLI_AGENT_SPECS[kind]

export const getAgentLabel = (kind: AgentKind): string => {
  if (isCliAgentKind(kind)) return CLI_AGENT_SPECS[kind].label
  if (kind === 'manual') return '手動'
  return kind
}

// 自動実行に対応しているか（manualや未対応エージェントの判定に使う）。
export const isAutoRunAgentKind = (kind: AgentKind): kind is CliAgentKind =>
  isCliAgentKind(kind)

// いずれかのCLIエージェントの既定コマンド名か（別エージェントの既定値が
// 残っているだけかどうかの判定に使う）。
export const isKnownDefaultCommand = (command: string): boolean =>
  CLI_AGENT_KINDS.some(
    (kind) => CLI_AGENT_SPECS[kind].defaultCommand === command.trim(),
  )

const commandBasename = (command: string): string =>
  command.trim().split(/[\\/]/).pop()?.toLowerCase() ?? ''

// 選択エージェントに対して整合するコマンド設定を返す。
// defaultAgentとagentCommandConfigがズレている（例: opencodeを選んだのに
// コマンドがcodexのまま）場合に、選択エージェントの既定値へ寄せる。
// ユーザー独自のコマンド（絶対パス等）は保持する。
export const resolveAgentCommandConfig = (
  kind: AgentKind,
  current: AgentCommandConfig,
): AgentCommandConfig => {
  if (!isCliAgentKind(kind)) return current
  const spec = CLI_AGENT_SPECS[kind]
  const command = current.codexCommand.trim()
  // 既にこのエージェント用の正しいコマンド名なら維持（独自の絶対パス含む）。
  if (spec.allowedCommandBasenames.includes(commandBasename(command))) {
    return current
  }
  // 空、または別エージェントの既定コマンドのままなら、このエージェントの
  // 既定コマンド・引数へ合わせる。
  if (command === '' || isKnownDefaultCommand(command)) {
    return {
      codexCommand: spec.defaultCommand,
      codexArgs: spec.defaultArgs,
    }
  }
  // それ以外（ユーザー独自のコマンド）はそのまま維持する。
  return current
}
