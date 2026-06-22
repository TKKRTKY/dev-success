import { getActualStatusChanges } from './domain/status'
import type {
  FeatureSeed,
  ProjectStatus,
  RunResult,
  StatusChanges,
} from './domain/types'

export interface CreateFeatureSeedRunResultInput {
  featureSeed: FeatureSeed
  content: string
  projectStatus: ProjectStatus
}

const successPattern = /成功|success|passed|\bOK\b/i
const failurePattern = /エラー|error|failed|失敗/i
const untestedPattern = /テスト未追加|未テスト/

const mergeChanges = (
  base: StatusChanges,
  added: StatusChanges,
): StatusChanges => ({
  completion: (base.completion ?? 0) + (added.completion ?? 0),
  technicalDebt:
    (base.technicalDebt ?? 0) + (added.technicalDebt ?? 0),
  stamina: (base.stamina ?? 0) + (added.stamina ?? 0),
  motivation: (base.motivation ?? 0) + (added.motivation ?? 0),
})

export const getFeatureSeedCompletionChanges = (
  featureSeed: FeatureSeed,
  content: string,
): StatusChanges => {
  let changes: StatusChanges = { ...featureSeed.effects }

  if (successPattern.test(content)) {
    changes = mergeChanges(changes, { completion: 2 })
  }
  if (failurePattern.test(content)) {
    changes = mergeChanges(changes, {
      technicalDebt: 6,
      motivation: -1,
    })
  }
  if (untestedPattern.test(content)) {
    changes = mergeChanges(changes, { technicalDebt: 3 })
  }

  return changes
}

const extractChangedFiles = (content: string): string[] => {
  const pathPattern =
    /(?:^|[\s"'`(])((?:\.{0,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+\.[a-zA-Z0-9]+|[\w@.-]+\.(?:tsx?|jsx?|css|scss|json|md|ya?ml|toml|html|vue|svelte|py|rb|go|rs|java|kt|swift|sql))(?:$|[\s"'`),:])/gm
  return [
    ...new Set(
      Array.from(content.matchAll(pathPattern), (match) => match[1]),
    ),
  ]
}

const summarize = (logs: string[]): string => {
  const summary = logs.slice(0, 3).join(' ')
  return summary.length > 180 ? `${summary.slice(0, 177)}…` : summary
}

export const createFeatureSeedRunResult = ({
  featureSeed,
  content,
  projectStatus,
}: CreateFeatureSeedRunResultInput): RunResult | null => {
  const trimmedContent = content.trim()
  if (!trimmedContent) return null

  const logs = trimmedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const requestedChanges = getFeatureSeedCompletionChanges(
    featureSeed,
    trimmedContent,
  )

  return {
    id: crypto.randomUUID(),
    turn: projectStatus.turn + 1,
    commandType: 'build',
    title: `「${featureSeed.title}」の実装結果`,
    summary: summarize(logs),
    statusChanges: getActualStatusChanges(
      projectStatus,
      requestedChanges,
    ),
    changedFiles: extractChangedFiles(trimmedContent),
    logs: [
      `feature seed: ${featureSeed.id} / ${featureSeed.title}`,
      ...logs,
    ],
    recommendation:
      '実装結果を記録しました。次は「確かめる」で変更内容を検証しましょう。',
    createdAt: new Date().toISOString(),
    featureSeedId: featureSeed.id,
    featureSeedTitle: featureSeed.title,
  }
}
