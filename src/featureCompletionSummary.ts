import type {
  FeatureCompletionSummary,
  FeatureSeed,
  ImplementationReview,
  ProjectConfig,
  ProjectStatus,
  VerificationType,
} from './domain/types'

export interface GenerateFeatureCompletionSummaryInput {
  featureSeed: FeatureSeed
  implementationReview: ImplementationReview
  projectConfig: ProjectConfig
  projectStatus: ProjectStatus
}

const verificationTypes: VerificationType[] = [
  'test',
  'lint',
  'typecheck',
  'build',
]

const unique = (items: string[]): string[] => [...new Set(items)]

export const generateFeatureCompletionSummary = ({
  featureSeed,
  implementationReview,
  projectConfig,
  projectStatus,
}: GenerateFeatureCompletionSummaryInput): FeatureCompletionSummary => {
  const agentText =
    implementationReview.agentRun?.agentKind === 'manual'
      ? '手動実装の結果を取り込みました。'
      : implementationReview.agentRun
        ? `エージェント実行は${implementationReview.agentRun.success ? '成功' : '失敗'}しました。`
        : 'エージェント実行結果は記録されていません。'
  const diff = implementationReview.repositoryDiff
  const diffText =
    diff && !diff.error
      ? `${diff.fileCount}ファイルの変更があり、差分リスクは${diff.riskLevel}です。`
      : 'git diffは確認できていません。'
  const summary =
    `${featureSeed.title} を実装しました。${featureSeed.description} ` +
    `期待する効果は「${featureSeed.expectedImpact}」です。` +
    `${agentText}${diffText}` +
    ` 実装方針は「${featureSeed.implementationHint}」です。` +
    ` サマリー生成時のプロジェクト完成度は${projectStatus.completion}%です。`

  const verificationSummary = verificationTypes.map((verificationType) => {
    const command = projectConfig.verificationCommands[verificationType]
    const latest = implementationReview.verifications.find(
      (verification) =>
        verification.verificationType === verificationType,
    )
    return `${verificationType}: ${
      latest ? (latest.success ? '成功' : '失敗') : '未実行'
    }${command ? `（${command}）` : ''}`
  })

  const hasFailedVerification = implementationReview.verifications.some(
    (verification) => !verification.success,
  )
  const hasPendingHighVerification =
    implementationReview.recommendedVerifications?.some(
      (verification) =>
        verification.priority === 'high' &&
        verification.status === 'not-run',
    ) ?? false

  const concerns = [...implementationReview.concerns]
  if (hasFailedVerification)
    concerns.push('失敗している確認コマンドがあります')
  if (hasPendingHighVerification) concerns.push('重要な確認が未実行です')
  if (diff?.riskLevel === 'high') concerns.push('差分リスクが高いです')
  if (!diff || diff.error) concerns.push('git diffが未取得です')

  const recommendations = [...implementationReview.recommendations]
  if (hasPendingHighVerification)
    recommendations.push('確かめるで重要な確認を実行してください')
  if (hasFailedVerification)
    recommendations.push('失敗している確認コマンドを修正してください')
  if (unique(concerns).length <= 1) {
    recommendations.push(
      '次の機能の元を考えるか、リリース判定を行いましょう',
    )
  }

  return {
    featureSeedId: featureSeed.id,
    title: featureSeed.title,
    completedAt: new Date().toISOString(),
    summary,
    changedFiles:
      diff && !diff.error ? [...new Set(diff.changedFiles)] : [],
    verificationSummary,
    concerns: unique(concerns),
    recommendations: unique(recommendations),
    readiness: implementationReview.readiness,
  }
}
