import { commandDefinitions } from './domain/commands'
import type {
  FeatureSeed,
  FeatureSeedCategory,
  ProjectConfig,
  ProjectContextSummary,
  ProjectStatus,
  RepositoryDiff,
  RepositoryStatus,
  RunHistoryEntry,
  RunResult,
} from './domain/types'

export interface BuildProjectContextSummaryInput {
  projectStatus: ProjectStatus
  projectConfig: ProjectConfig
  runHistory: RunHistoryEntry[]
  featureSeeds: FeatureSeed[]
  repositoryStatus?: RepositoryStatus | null
  repositoryDiff?: RepositoryDiff | null
}

const unique = <Value>(values: Value[]): Value[] => [...new Set(values)]

const summarizeRun = (result: RunResult): string =>
  `${commandDefinitions[result.commandType].label}: ${result.title} — ${result.summary}`

export const buildProjectContextSummary = ({
  projectStatus,
  projectConfig,
  runHistory,
  featureSeeds,
  repositoryStatus,
  repositoryDiff,
}: BuildProjectContextSummaryInput): ProjectContextSummary => {
  const builtSeeds = featureSeeds.filter((seed) => seed.status === 'built')
  const uncheckedSeeds = builtSeeds.filter(
    (seed) => (seed.verificationStatus ?? 'unchecked') === 'unchecked',
  )
  const failedSeeds = builtSeeds.filter(
    (seed) => seed.verificationStatus === 'failed',
  )
  const plannedSeeds = featureSeeds.filter(
    (seed) => seed.status === 'planned',
  )
  const recentProgress = unique([
    ...runHistory.slice(0, 5).map((entry) => summarizeRun(entry.result)),
    ...builtSeeds
      .slice(0, 3)
      .map(
        (seed) =>
          `完成済み機能: ${seed.title}${
            seed.completionSummary
              ? ` — ${seed.completionSummary.summary}`
              : ''
          }`,
      ),
  ]).slice(0, 8)
  const openConcerns: string[] = []

  uncheckedSeeds.forEach((seed) => {
    openConcerns.push(`「${seed.title}」はbuilt済みですが未確認です。`)
  })
  failedSeeds.forEach((seed) => {
    openConcerns.push(`「${seed.title}」の確認結果に失敗があります。`)
  })
  if (projectStatus.technicalDebt >= 20) {
    openConcerns.push(
      `技術的負債が${projectStatus.technicalDebt}まで増えています。`,
    )
  }
  if (projectStatus.stamina <= 35) {
    openConcerns.push(`体力が${projectStatus.stamina}まで低下しています。`)
  }
  if (plannedSeeds.length >= 3) {
    openConcerns.push('機能の元スロットが3個すべて埋まっています。')
  }
  if (
    (repositoryDiff && repositoryDiff.fileCount > 0) ||
    (repositoryStatus && repositoryStatus.changedFiles.length > 0)
  ) {
    const count =
      repositoryDiff?.fileCount ?? repositoryStatus?.changedFiles.length ?? 0
    openConcerns.push(`未整理のgit差分が${count}ファイルあります。`)
  }

  const suggestedFocus: FeatureSeedCategory[] = []
  if (uncheckedSeeds.length >= 1) suggestedFocus.push('test')
  if (failedSeeds.length >= 1) suggestedFocus.push('refactor', 'test')
  if (projectStatus.technicalDebt >= 20) {
    suggestedFocus.push('refactor', 'documentation')
  }
  if (projectStatus.stamina <= 35) {
    suggestedFocus.push('documentation', 'developer-experience')
  }
  if (projectStatus.completion < 45) suggestedFocus.push('feature', 'ui')
  if (suggestedFocus.length === 0) {
    suggestedFocus.push('feature', 'developer-experience')
  }

  const normalizedFocus = unique(suggestedFocus)
  const nextThinkHints: string[] = []
  if (uncheckedSeeds.length > 0) {
    nextThinkHints.push(
      '未確認の機能があるため、確認を支援する候補を優先する。',
    )
  }
  if (failedSeeds.length > 0) {
    nextThinkHints.push(
      '失敗した確認結果があるため、小さな修正や回帰テスト候補を出す。',
    )
  }
  if (projectStatus.technicalDebt >= 20) {
    nextThinkHints.push(
      '技術的負債が高いため、小さなリファクタや文書整理候補を出す。',
    )
  }
  if (projectStatus.stamina <= 35) {
    nextThinkHints.push(
      '体力が低いため、短時間で終わる整備・開発体験改善を優先する。',
    )
  }
  if (projectStatus.completion < 45) {
    nextThinkHints.push(
      '完成度が低いため、価値が見える小さな機能やUI候補を含める。',
    )
  }
  while (nextThinkHints.length < 3) {
    nextThinkHints.push(
      `「${projectConfig.appName}」の次の価値を、小さく確認できる候補にする。`,
    )
  }

  const progressLabel =
    recentProgress.length > 0
      ? `${recentProgress.length}件の進捗`
      : 'まだ大きな進捗なし'
  const concernLabel =
    openConcerns.length > 0
      ? `${openConcerns.length}件の懸念`
      : '目立った懸念なし'

  return {
    generatedAt: new Date().toISOString(),
    turn: projectStatus.turn,
    summary: `${progressLabel}を整理し、${concernLabel}を確認しました。次は${normalizedFocus.slice(0, 3).join('・')}を意識すると良さそうです。`,
    recentProgress,
    openConcerns,
    suggestedFocus: normalizedFocus,
    nextThinkHints: unique(nextThinkHints).slice(0, 3),
  }
}

export const getOrganizeStatusChanges = (
  contextSummary: ProjectContextSummary,
) => ({
  stamina: 10,
  motivation: 1,
  technicalDebt: contextSummary.openConcerns.length >= 3 ? -1 : -3,
})
