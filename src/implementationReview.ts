import type {
  ImplementationReview,
  ImplementationReadiness,
} from './domain/types'

const unique = (items: string[]): string[] => [...new Set(items)]

export const createImplementationReview = (
  featureSeedId: string,
): ImplementationReview =>
  evaluateImplementationReadiness({
    featureSeedId,
    verifications: [],
    operationErrors: [],
    readiness: 'unknown',
    concerns: [],
    recommendations: [],
    updatedAt: new Date().toISOString(),
  })

export const evaluateImplementationReadiness = (
  review: ImplementationReview,
): ImplementationReview => {
  const usesManualAgent = review.agentRun?.agentKind === 'manual'
  const failedVerifications = review.verifications.filter(
    (verification) => !verification.success,
  )
  const successfulTypes = new Set(
    review.verifications
      .filter((verification) => verification.success)
      .map((verification) => verification.verificationType),
  )
  const diffAvailable =
    Boolean(review.repositoryDiff) && !review.repositoryDiff?.error

  let readiness: ImplementationReadiness
  if (!review.agentRun) {
    readiness = 'unknown'
  } else if (
    (!review.agentRun.success && !usesManualAgent) ||
    (diffAvailable && review.repositoryDiff?.riskLevel === 'high') ||
    failedVerifications.length > 0
  ) {
    readiness = 'risky'
  } else if (
    successfulTypes.has('typecheck') ||
    successfulTypes.has('test') ||
    successfulTypes.has('build')
  ) {
    readiness = 'ready'
  } else {
    readiness = 'reviewable'
  }

  const concerns: string[] = [...(review.operationErrors ?? [])]
  if (!review.agentRun) concerns.push('エージェント実行結果がありません')
  else if (!review.agentRun.success && !usesManualAgent)
    concerns.push('エージェント実行が失敗しています')
  if (review.repositoryDiff?.error) {
    concerns.push(`git diffの自動取得に失敗しました: ${review.repositoryDiff.error}`)
  } else if (!review.repositoryDiff) {
    concerns.push('git diffが未取得です')
  } else if (review.repositoryDiff.riskLevel === 'high') {
    concerns.push('差分リスクが高いです')
  }
  if (review.verifications.length === 0)
    concerns.push('確認コマンドが未実行です')
  if (failedVerifications.length > 0)
    concerns.push('失敗している確認コマンドがあります')
  if (!successfulTypes.has('test')) concerns.push('testが未実行です')
  if (!successfulTypes.has('build')) concerns.push('buildが未実行です')

  const recommendations: string[] = []
  if (!diffAvailable) {
    recommendations.push('手動でgit diffを再取得してください')
  }
  if (!successfulTypes.has('typecheck'))
    recommendations.push('typecheckを実行してください')
  if (!successfulTypes.has('test'))
    recommendations.push('testを実行してください')
  if (!successfulTypes.has('build'))
    recommendations.push('buildを実行してください')
  if (review.repositoryDiff?.riskLevel === 'high')
    recommendations.push('差分が大きいため整えるを検討してください')
  if (
    diffAvailable &&
    review.repositoryDiff?.riskLevel !== 'high'
  ) {
    recommendations.push(
      '確認コマンドを実行して問題なければ完成にできます',
    )
  }
  if (failedVerifications.length > 0)
    recommendations.push('失敗している確認結果を修正してください')
  if (readiness === 'ready')
    recommendations.push('問題なければこの機能を完成にできます')

  return {
    ...review,
    readiness,
    concerns: unique(concerns),
    recommendations: unique(recommendations),
    updatedAt: new Date().toISOString(),
  }
}
