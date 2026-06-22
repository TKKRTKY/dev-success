import type {
  StateValidationIssue,
  StateValidationResult,
  StateValidationSeverity,
} from './domain/types'
import type { PersistedAppState } from './storage'

const featureSeedStatuses = new Set([
  'planned',
  'building',
  'built',
  'discarded',
])
const readinessValues = new Set([
  'unknown',
  'risky',
  'reviewable',
  'ready',
])
const releaseRanks = new Set(['S', 'A', 'B', 'C', 'D'])

export const validateDevSuccessState = (
  state: PersistedAppState,
): StateValidationResult => {
  const issues: StateValidationIssue[] = []
  const add = (
    severity: StateValidationSeverity,
    message: string,
    path?: string,
  ) => issues.push({ severity, message, path })

  const projectStatus = state.projectStatus
  if (
    typeof projectStatus.completion !== 'number' ||
    projectStatus.completion < 0 ||
    projectStatus.completion > 100
  ) {
    add('error', 'completionが0〜100の範囲外です。', 'projectStatus.completion')
  }
  if (
    typeof projectStatus.stamina !== 'number' ||
    projectStatus.stamina < 0 ||
    projectStatus.stamina > 100
  ) {
    add('error', 'staminaが0〜100の範囲外です。', 'projectStatus.stamina')
  }
  if (
    typeof projectStatus.technicalDebt !== 'number' ||
    projectStatus.technicalDebt < 0
  ) {
    add('error', 'technicalDebtが0未満です。', 'projectStatus.technicalDebt')
  }
  if (typeof projectStatus.turn !== 'number' || projectStatus.turn < 1) {
    add('error', 'turnが1未満です。', 'projectStatus.turn')
  }

  if (state.scenarioStatus === 'completed' && !state.scenarioResult) {
    add(
      'error',
      'scenarioStatusがcompletedですがscenarioResultがありません。',
      'scenarioResult',
    )
  }
  if (state.scenarioStatus === 'playing' && !state.isStarted) {
    add(
      'warning',
      'scenarioStatusがplayingですがisStartedがfalseです。',
      'isStarted',
    )
  }
  if (
    typeof state.scenarioConfig.maxTurn !== 'number' ||
    state.scenarioConfig.maxTurn < 1
  ) {
    add('error', 'maxTurnが1未満です。', 'scenarioConfig.maxTurn')
  }

  const plannedSeeds = state.featureSeeds.filter(
    (seed) => String(seed.status) === 'planned',
  )
  const buildingSeeds = state.featureSeeds.filter(
    (seed) => String(seed.status) === 'building',
  )
  if (plannedSeeds.length > 3) {
    add(
      'error',
      `planned FeatureSeedが上限を超えています（${plannedSeeds.length}件）。`,
      'featureSeeds',
    )
  }
  if (buildingSeeds.length > 1) {
    add(
      'error',
      `building FeatureSeedが複数存在します（${buildingSeeds.length}件）。`,
      'featureSeeds',
    )
  }
  state.featureSeeds.forEach((seed, index) => {
    const path = `featureSeeds[${index}]`
    if (!featureSeedStatuses.has(String(seed.status))) {
      add(
        'error',
        `FeatureSeedのstatusが不正です: ${String(seed.status)}`,
        `${path}.status`,
      )
    }
    if (typeof seed.title !== 'string' || !seed.title.trim()) {
      add('error', 'FeatureSeedのtitleが空です。', `${path}.title`)
    }
    if (seed.status === 'built' && !seed.builtAt) {
      add(
        'warning',
        `built FeatureSeed「${seed.title}」にbuiltAtがありません。`,
        `${path}.builtAt`,
      )
    }
    if (seed.status === 'discarded' && !seed.discardedAt) {
      add(
        'warning',
        `discarded FeatureSeed「${seed.title}」にdiscardedAtがありません。`,
        `${path}.discardedAt`,
      )
    }
  })

  const seedIds = new Set(state.featureSeeds.map((seed) => seed.id))
  state.implementationReviews.forEach((review, index) => {
    const path = `implementationReviews[${index}]`
    if (!seedIds.has(review.featureSeedId)) {
      add(
        'warning',
        `ImplementationReviewが存在しないFeatureSeedを参照しています: ${review.featureSeedId}`,
        `${path}.featureSeedId`,
      )
    }
    if (!readinessValues.has(String(review.readiness))) {
      add(
        'error',
        `ImplementationReviewのreadinessが不正です: ${String(review.readiness)}`,
        `${path}.readiness`,
      )
    }
  })
  buildingSeeds.forEach((seed) => {
    if (
      !state.implementationReviews.some(
        (review) => review.featureSeedId === seed.id,
      )
    ) {
      add(
        'warning',
        `building FeatureSeed「${seed.title}」にImplementationReviewがありません。`,
        'implementationReviews',
      )
    }
  })

  state.runHistory.forEach((entry, index) => {
    const path = `runHistory[${index}].result`
    if (typeof entry.result.turn !== 'number') {
      add(
        'warning',
        `RunResult「${entry.result.title}」に有効なturnがありません。`,
        `${path}.turn`,
      )
    }
    if (entry.result.featureSeedId && !seedIds.has(entry.result.featureSeedId)) {
      add(
        'warning',
        `RunResult「${entry.result.title}」が存在しないFeatureSeedを参照しています: ${entry.result.featureSeedId}`,
        `${path}.featureSeedId`,
      )
    }
    if (!entry.result.createdAt) {
      add(
        'warning',
        `RunResult「${entry.result.title}」にcreatedAtがありません。`,
        `${path}.createdAt`,
      )
    }
  })

  if (
    state.latestReleaseJudgement &&
    !state.releaseJudgements.some(
      (judgement) => judgement.id === state.latestReleaseJudgement?.id,
    )
  ) {
    add(
      'warning',
      'latestReleaseJudgementがreleaseJudgementsに含まれていません。',
      'latestReleaseJudgement',
    )
  }
  const judgements = [
    ...state.releaseJudgements,
    ...(state.latestReleaseJudgement &&
    !state.releaseJudgements.some(
      (judgement) => judgement.id === state.latestReleaseJudgement?.id,
    )
      ? [state.latestReleaseJudgement]
      : []),
  ]
  judgements.forEach((judgement, index) => {
    const path = `releaseJudgements[${index}]`
    if (
      typeof judgement.score !== 'number' ||
      judgement.score < 0 ||
      judgement.score > 100
    ) {
      add(
        'error',
        `リリース判定「${judgement.id}」のscoreが0〜100の範囲外です。`,
        `${path}.score`,
      )
    }
    if (!releaseRanks.has(String(judgement.rank))) {
      add(
        'error',
        `リリース判定「${judgement.id}」のrankが不正です。`,
        `${path}.rank`,
      )
    }
  })

  if (state.contextSummary && !state.contextSummary.generatedAt) {
    add(
      'warning',
      'ContextSummaryにgeneratedAtがありません。',
      'contextSummary.generatedAt',
    )
  }

  if (issues.length === 0) {
    add('info', '状態の整合性に問題は見つかりませんでした。')
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter(
    (issue) => issue.severity === 'warning',
  ).length
  const infoCount = issues.filter((issue) => issue.severity === 'info').length

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    issues,
  }
}
