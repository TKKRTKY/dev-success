import { commandDefinitions } from './domain/commands'
import { getActualStatusChanges } from './domain/status'
import type {
  CommandType,
  ProjectStatus,
  RunResult,
  StatusChanges,
} from './domain/types'

export interface ParsePastedAgentResultInput {
  commandType: CommandType
  content: string
  projectStatus: ProjectStatus
}

const recommendations: Record<CommandType, string> = {
  think: '整理した内容を確認し、次は「作る」で小さく着手しましょう。',
  build: '次は「確かめる」で変更内容を検証しましょう。',
  verify: '確認結果をもとに、必要なら修正するか次の実装へ進みましょう。',
  check: '確認結果をもとに、必要なら修正するか次の実装へ進みましょう。',
  organize: '整理したコンテキストを使って、次の行動を選びましょう。',
  release: '判定結果の懸念を解消してから、もう一度リリース判定を行いましょう。',
}

const successPattern = /成功|通過|passed|\bOK\b/i
const failurePattern = /失敗|failed|error|エラー/i
const untestedPattern = /テスト未追加|未テスト/

export const estimateStatusChanges = (
  commandType: CommandType,
  content: string,
): StatusChanges => {
  const succeeded = successPattern.test(content)
  const failed = failurePattern.test(content)
  const untested = untestedPattern.test(content)
  const changes: StatusChanges = {}

  if (succeeded) changes.completion = (changes.completion ?? 0) + 2
  if (failed) changes.technicalDebt = (changes.technicalDebt ?? 0) + 4
  if (untested) changes.technicalDebt = (changes.technicalDebt ?? 0) + 2

  switch (commandType) {
    case 'build':
      changes.completion = (changes.completion ?? 0) + 8
      changes.stamina = (changes.stamina ?? 0) - 12
      break
    case 'verify':
      if (succeeded) {
        changes.technicalDebt = (changes.technicalDebt ?? 0) - 4
      }
      if (failed) {
        changes.technicalDebt = (changes.technicalDebt ?? 0) + 4
      }
      break
    case 'organize':
      changes.technicalDebt = (changes.technicalDebt ?? 0) - 5
      break
    case 'think':
      changes.motivation = 1
      break
  }

  return changes
}

const extractChangedFiles = (content: string): string[] => {
  const pathPattern =
    /(?:^|[\s"'`(])((?:\.{0,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+\.[a-zA-Z0-9]+|[\w@.-]+\.(?:tsx?|jsx?|css|scss|json|md|ya?ml|toml|html|vue|svelte|py|rb|go|rs|java|kt|swift|sql))(?:$|[\s"'`),:])/gm
  const files = Array.from(content.matchAll(pathPattern), (match) => match[1])
  return [...new Set(files)]
}

const buildSummary = (logs: string[]): string => {
  const source = logs.slice(0, 3).join(' ')
  return source.length > 180 ? `${source.slice(0, 177)}…` : source
}

export const parsePastedAgentResult = ({
  commandType,
  content,
  projectStatus,
}: ParsePastedAgentResultInput): RunResult | null => {
  const trimmedContent = content.trim()
  if (!trimmedContent) return null

  const logs = trimmedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const requestedChanges = estimateStatusChanges(commandType, trimmedContent)
  const statusChanges = getActualStatusChanges(
    projectStatus,
    requestedChanges,
  )
  const commandLabel = commandDefinitions[commandType].label

  return {
    id: crypto.randomUUID(),
    turn: projectStatus.turn,
    commandType,
    title: `${commandLabel}コマンドの実行結果`,
    summary: buildSummary(logs),
    statusChanges,
    changedFiles: extractChangedFiles(trimmedContent),
    logs,
    recommendation: recommendations[commandType],
    createdAt: new Date().toISOString(),
  }
}
