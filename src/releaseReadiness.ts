import type {
  FeatureSeed,
  ProjectConfig,
  ProjectContextSummary,
  ProjectStatus,
  ReleaseJudgement,
  ReleaseRank,
  RunHistoryEntry,
} from './domain/types'

export interface EvaluateReleaseReadinessInput {
  projectStatus: ProjectStatus
  projectConfig: ProjectConfig
  featureSeeds: FeatureSeed[]
  runHistory: RunHistoryEntry[]
  contextSummary?: ProjectContextSummary
  turn: number
}

const rankSummaries: Record<ReleaseRank, string> = {
  S: '非常に良い状態です。自信を持ってリリースできます。',
  A: '小さな懸念はありますが、リリース可能な状態です。',
  B: 'β版としては公開可能です。いくつか確認を追加するとより安全です。',
  C: 'まだ確認不足です。追加の実装や検証をおすすめします。',
  D: '現時点でのリリースは危険です。負債や失敗を整理しましょう。',
}

const getRank = (score: number): ReleaseRank => {
  if (score >= 90) return 'S'
  if (score >= 75) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

const unique = (items: string[]): string[] => [...new Set(items)]

export const evaluateReleaseReadiness = ({
  projectStatus,
  projectConfig,
  featureSeeds,
  runHistory,
  contextSummary,
  turn,
}: EvaluateReleaseReadinessInput): ReleaseJudgement => {
  const builtSeeds = featureSeeds.filter((seed) => seed.status === 'built')
  const passedCount = builtSeeds.filter(
    (seed) => seed.verificationStatus === 'passed',
  ).length
  const failedCount = builtSeeds.filter(
    (seed) => seed.verificationStatus === 'failed',
  ).length
  const uncheckedCount = builtSeeds.filter(
    (seed) =>
      !seed.verificationStatus ||
      seed.verificationStatus === 'unchecked' ||
      seed.verificationStatus === 'partial',
  ).length

  const completionScore = Math.round(projectStatus.completion * 0.4)
  const debtScore =
    projectStatus.technicalDebt <= 10
      ? 20
      : projectStatus.technicalDebt <= 25
        ? 15
        : projectStatus.technicalDebt <= 50
          ? 8
          : 0
  const builtScore =
    builtSeeds.length >= 5
      ? 15
      : builtSeeds.length >= 3
        ? 10
        : builtSeeds.length >= 1
          ? 5
          : 0
  const verificationScore =
    builtSeeds.length > 0
      ? Math.round((passedCount / builtSeeds.length) * 15)
      : 0
  const failureScore = failedCount === 0 ? 10 : failedCount === 1 ? 5 : 0
  const score = Math.min(
    100,
    completionScore +
      debtScore +
      builtScore +
      verificationScore +
      failureScore,
  )
  const rank = getRank(score)

  const strengths: string[] = []
  if (projectStatus.completion >= 75) strengths.push('完成度が高い')
  if (builtSeeds.length > 0)
    strengths.push(`built済み機能が${builtSeeds.length}件ある`)
  if (builtSeeds.length > 0 && passedCount / builtSeeds.length >= 0.7)
    strengths.push('確認済み機能が多い')
  if (projectStatus.technicalDebt <= 10)
    strengths.push('技術的負債が低い')
  if (failedCount === 0 && builtSeeds.length > 0)
    strengths.push('失敗状態の機能がない')
  if (strengths.length === 0)
    strengths.push(`${projectConfig.appName}の評価可能な状態が記録されている`)

  const concerns: string[] = []
  if (uncheckedCount > 0)
    concerns.push(`未確認または一部確認の機能が${uncheckedCount}件ある`)
  if (failedCount > 0)
    concerns.push(`failed状態の機能が${failedCount}件ある`)
  if (projectStatus.technicalDebt >= 26)
    concerns.push(`技術的負債が高い（${projectStatus.technicalDebt}）`)
  if (builtSeeds.length === 0) concerns.push('built済み機能がない')
  else if (builtSeeds.length < 3) concerns.push('built済み機能がまだ少ない')
  if (projectStatus.completion < 60)
    concerns.push(`completionが低い（${projectStatus.completion}%）`)
  if (contextSummary?.openConcerns.length)
    concerns.push(...contextSummary.openConcerns.slice(0, 2))

  const recommendations: string[] = []
  if (uncheckedCount > 0)
    recommendations.push('「確かめる」でtypecheckやtestを実行する')
  if (failedCount > 0)
    recommendations.push('failed状態の機能を修正して再確認する')
  if (projectStatus.technicalDebt > 10)
    recommendations.push('「整える」でコンテキストと技術的負債を整理する')
  if (builtSeeds.length < 3 || projectStatus.completion < 60)
    recommendations.push('「考える」で小さな改善候補を出す')
  if (!contextSummary || contextSummary.openConcerns.length > 0)
    recommendations.push('READMEや確認手順を整える')
  if (recommendations.length === 0)
    recommendations.push('最終確認を行い、リリース手順へ進む')

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    turn,
    rank,
    score,
    summary: rankSummaries[rank],
    strengths: unique(strengths),
    concerns: unique(concerns),
    recommendations: unique([
      ...recommendations,
      ...(runHistory.length === 0 ? ['開発履歴を記録して判断材料を増やす'] : []),
    ]).slice(0, 5),
  }
}
