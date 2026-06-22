import type {
  FeatureSeed,
  ImplementationReview,
  ProjectConfig,
  RecommendedVerification,
  VerificationType,
} from './domain/types'

export interface GenerateRecommendedVerificationsInput {
  featureSeed: FeatureSeed
  implementationReview: ImplementationReview
  projectConfig: ProjectConfig
}

type Priority = RecommendedVerification['priority']

const priorityRank: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const categoryRules: Record<
  FeatureSeed['category'],
  Partial<Record<VerificationType, Priority>>
> = {
  feature: { typecheck: 'high', test: 'medium', build: 'low' },
  ui: { typecheck: 'high', test: 'medium', build: 'medium' },
  test: { test: 'high', typecheck: 'medium' },
  refactor: { typecheck: 'high', test: 'high' },
  documentation: { lint: 'medium', build: 'low' },
  'developer-experience': {
    typecheck: 'medium',
    lint: 'medium',
    build: 'low',
  },
}

const addRecommendation = (
  priorities: Map<VerificationType, Priority>,
  reasons: Map<VerificationType, string[]>,
  verificationType: VerificationType,
  priority: Priority,
  reason: string,
) => {
  const current = priorities.get(verificationType)
  if (!current || priorityRank[priority] > priorityRank[current]) {
    priorities.set(verificationType, priority)
  }
  reasons.set(verificationType, [
    ...(reasons.get(verificationType) ?? []),
    reason,
  ])
}

export const generateRecommendedVerifications = ({
  featureSeed,
  implementationReview,
  projectConfig,
}: GenerateRecommendedVerificationsInput): RecommendedVerification[] => {
  const priorities = new Map<VerificationType, Priority>()
  const reasons = new Map<VerificationType, string[]>()

  addRecommendation(
    priorities,
    reasons,
    'typecheck',
    'high',
    '型の不整合を早めに検出する基本確認です',
  )

  for (const [verificationType, priority] of Object.entries(
    categoryRules[featureSeed.category],
  ) as [VerificationType, Priority][]) {
    addRecommendation(
      priorities,
      reasons,
      verificationType,
      priority,
      `${featureSeed.category}カテゴリの変更に適した確認です`,
    )
  }

  const diffRisk = implementationReview.repositoryDiff?.error
    ? undefined
    : implementationReview.repositoryDiff?.riskLevel
  if (diffRisk === 'high') {
    addRecommendation(
      priorities,
      reasons,
      'typecheck',
      'high',
      '差分リスクが高いため型確認を優先します',
    )
    addRecommendation(
      priorities,
      reasons,
      'test',
      'high',
      '差分リスクが高いため回帰確認が必要です',
    )
    addRecommendation(
      priorities,
      reasons,
      'build',
      'medium',
      '大きな差分がビルド可能か確認します',
    )
  } else if (diffRisk === 'medium') {
    addRecommendation(
      priorities,
      reasons,
      'typecheck',
      'high',
      '中規模の差分なので型確認を優先します',
    )
    addRecommendation(
      priorities,
      reasons,
      'test',
      'medium',
      '中規模の差分による回帰を確認します',
    )
  }

  return [...priorities.entries()]
    .map(([verificationType, priority]) => {
      const latestResult = implementationReview.verifications.find(
        (verification) =>
          verification.verificationType === verificationType,
      )
      return {
        verificationType,
        command: projectConfig.verificationCommands[verificationType],
        reason: [...new Set(reasons.get(verificationType) ?? [])].join('。'),
        priority,
        status: latestResult
          ? latestResult.success
            ? 'passed'
            : 'failed'
          : 'not-run',
      } satisfies RecommendedVerification
    })
    .sort(
      (left, right) =>
        priorityRank[right.priority] - priorityRank[left.priority],
    )
}
