import { COMMAND_TYPES, MOTIVATIONS } from './domain/types'
import { initialProjectConfig } from './domain/projectConfig'
import { createInitialScenarioConfig } from './domain/scenario'
import { clearSetupState } from './setupStorage'
import type {
  FeatureSeed,
  FeatureCompletionSummary,
  FeatureSeedOption,
  FeatureVerification,
  IdeaGenerationInfo,
  ProjectConfig,
  GitDiffSummary,
  ImplementationReview,
  ParsedVerificationResult,
  ProjectStatus,
  ProjectContextSummary,
  ReleaseJudgement,
  RecommendedVerification,
  ScenarioConfig,
  ScenarioResult,
  ScenarioStatus,
  RunHistoryEntry,
  RunResult,
} from './domain/types'

const STORAGE_KEY = 'dev-success:state'
export const PLAYTEST_CHECKLIST_STORAGE_KEY =
  'dev-success:playtest-checklist'
export const STORAGE_VERSION = 10

export interface PersistedAppState {
  version: number
  isStarted: boolean
  projectConfig: ProjectConfig
  projectStatus: ProjectStatus
  runHistory: RunHistoryEntry[]
  selectedResultId: string | null
  featureSeeds: FeatureSeed[]
  latestIdeaOptions: FeatureSeedOption[]
  ideaGenerationInfo?: IdeaGenerationInfo
  contextSummary?: ProjectContextSummary
  latestReleaseJudgement?: ReleaseJudgement
  releaseJudgements: ReleaseJudgement[]
  scenarioConfig: ScenarioConfig
  scenarioStatus: ScenarioStatus
  scenarioResult?: ScenarioResult
  implementationReviews: ImplementationReview[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isProjectStatus = (value: unknown): value is ProjectStatus => {
  if (!isRecord(value)) return false

  return (
    typeof value.turn === 'number' &&
    typeof value.completion === 'number' &&
    typeof value.stamina === 'number' &&
    typeof value.technicalDebt === 'number' &&
    MOTIVATIONS.includes(value.motivation as (typeof MOTIVATIONS)[number])
  )
}

const isProjectConfig = (value: unknown): value is ProjectConfig => {
  if (
    !isRecord(value) ||
    !isRecord(value.verificationCommands) ||
    (value.agentCommandConfig !== undefined &&
      !isRecord(value.agentCommandConfig))
  ) {
    return false
  }

  return (
    typeof value.appName === 'string' &&
    (value.productVision === undefined ||
      typeof value.productVision === 'string') &&
    (value.targetUser === undefined || typeof value.targetUser === 'string') &&
    (value.problemStatement === undefined ||
      typeof value.problemStatement === 'string') &&
    (value.initialGoal === undefined || typeof value.initialGoal === 'string') &&
    typeof value.repositoryPath === 'string' &&
    typeof value.techStack === 'string' &&
    ['npm', 'pnpm', 'yarn', 'bun', 'other'].includes(
      String(value.packageManager),
    ) &&
    [
      'codex',
      'claude-code',
      'opencode',
      'cursor',
      'devin',
      'manual',
      'other',
    ].includes(String(value.defaultAgent)) &&
    (value.developmentStyle === undefined ||
      ['safe', 'fast', 'experimental', 'quality-focused'].includes(
        String(value.developmentStyle),
      )) &&
    (value.agentCommandConfig === undefined ||
      (isRecord(value.agentCommandConfig) &&
        typeof value.agentCommandConfig.codexCommand === 'string' &&
        typeof value.agentCommandConfig.codexArgs === 'string')) &&
    (value.agentTimeoutMs === undefined ||
      typeof value.agentTimeoutMs === 'number') &&
    typeof value.verificationCommands.test === 'string' &&
    typeof value.verificationCommands.lint === 'string' &&
    typeof value.verificationCommands.typecheck === 'string' &&
    typeof value.verificationCommands.build === 'string'
  )
}

const isProjectContextSummary = (
  value: unknown,
): value is ProjectContextSummary =>
  isRecord(value) &&
  typeof value.generatedAt === 'string' &&
  typeof value.turn === 'number' &&
  typeof value.summary === 'string' &&
  Array.isArray(value.recentProgress) &&
  value.recentProgress.every((item) => typeof item === 'string') &&
  Array.isArray(value.openConcerns) &&
  value.openConcerns.every((item) => typeof item === 'string') &&
  Array.isArray(value.suggestedFocus) &&
  value.suggestedFocus.every((item) =>
    featureSeedCategories.includes(String(item)),
  ) &&
  Array.isArray(value.nextThinkHints) &&
  value.nextThinkHints.every((item) => typeof item === 'string')

const isIdeaGenerationInfo = (value: unknown): value is IdeaGenerationInfo =>
  isRecord(value) &&
  ['ai', 'repaired', 'fallback', 'mixed'].includes(String(value.source)) &&
  typeof value.rawOutput === 'string' &&
  (value.warnings === undefined ||
    (Array.isArray(value.warnings) &&
      value.warnings.every((warning) => typeof warning === 'string'))) &&
  (value.error === undefined || typeof value.error === 'string') &&
  typeof value.generatedAt === 'string'

const isReleaseJudgement = (value: unknown): value is ReleaseJudgement =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.createdAt === 'string' &&
  typeof value.turn === 'number' &&
  ['S', 'A', 'B', 'C', 'D'].includes(String(value.rank)) &&
  typeof value.score === 'number' &&
  typeof value.summary === 'string' &&
  Array.isArray(value.strengths) &&
  value.strengths.every((item) => typeof item === 'string') &&
  Array.isArray(value.concerns) &&
  value.concerns.every((item) => typeof item === 'string') &&
  Array.isArray(value.recommendations) &&
  value.recommendations.every((item) => typeof item === 'string')

const isScenarioConfig = (value: unknown): value is ScenarioConfig =>
  isRecord(value) &&
  typeof value.maxTurn === 'number' &&
  value.maxTurn > 0 &&
  typeof value.goal === 'string'

const isScenarioStatus = (value: unknown): value is ScenarioStatus =>
  value === 'playing' || value === 'completed'

const isScenarioResult = (value: unknown): value is ScenarioResult =>
  isRecord(value) &&
  typeof value.completedAt === 'string' &&
  typeof value.finalTurn === 'number' &&
  (value.releaseJudgementId === undefined ||
    typeof value.releaseJudgementId === 'string') &&
  ['S', 'A', 'B', 'C', 'D'].includes(String(value.rank)) &&
  typeof value.summary === 'string'

const featureSeedCategories = [
  'feature',
  'ui',
  'test',
  'refactor',
  'documentation',
  'developer-experience',
]
const featureSeedDifficulties = ['small', 'medium', 'large']
const featureSeedStatuses = ['planned', 'building', 'built', 'discarded']
const featureVerificationStatuses = [
  'unchecked',
  'passed',
  'failed',
  'partial',
]

const isFeatureVerification = (
  value: unknown,
): value is FeatureVerification =>
  isRecord(value) &&
  ['test', 'lint', 'typecheck', 'build'].includes(
    String(value.verificationType),
  ) &&
  typeof value.command === 'string' &&
  typeof value.success === 'boolean' &&
  typeof value.checkedAt === 'string' &&
  typeof value.summaryText === 'string' &&
  (value.runResultId === undefined || typeof value.runResultId === 'string')

const isFeatureCompletionSummary = (
  value: unknown,
): value is FeatureCompletionSummary =>
  isRecord(value) &&
  typeof value.featureSeedId === 'string' &&
  typeof value.title === 'string' &&
  typeof value.completedAt === 'string' &&
  typeof value.summary === 'string' &&
  Array.isArray(value.changedFiles) &&
  value.changedFiles.every((item) => typeof item === 'string') &&
  Array.isArray(value.verificationSummary) &&
  value.verificationSummary.every((item) => typeof item === 'string') &&
  Array.isArray(value.concerns) &&
  value.concerns.every((item) => typeof item === 'string') &&
  Array.isArray(value.recommendations) &&
  value.recommendations.every((item) => typeof item === 'string') &&
  ['unknown', 'risky', 'reviewable', 'ready'].includes(
    String(value.readiness),
  )

const isAgentRunResponse = (value: unknown): boolean =>
  isRecord(value) &&
  [
    'codex',
    'claude-code',
    'opencode',
    'cursor',
    'devin',
    'manual',
    'other',
  ].includes(String(value.agentKind)) &&
  typeof value.success === 'boolean' &&
  (value.exitCode === null || typeof value.exitCode === 'number') &&
  typeof value.stdout === 'string' &&
  typeof value.stderr === 'string' &&
  typeof value.durationMs === 'number' &&
  (value.error === undefined || typeof value.error === 'string')

const isRepositoryDiff = (value: unknown): boolean =>
  isRecord(value) &&
  Array.isArray(value.changedFiles) &&
  value.changedFiles.every((file) => typeof file === 'string') &&
  typeof value.nameOnlyText === 'string' &&
  typeof value.statText === 'string' &&
  typeof value.insertions === 'number' &&
  typeof value.deletions === 'number' &&
  typeof value.fileCount === 'number' &&
  ['low', 'medium', 'high'].includes(String(value.riskLevel)) &&
  (value.error === undefined || typeof value.error === 'string')

const isImplementationReview = (
  value: unknown,
): value is ImplementationReview =>
  isRecord(value) &&
  typeof value.featureSeedId === 'string' &&
  (value.agentRun === undefined || isAgentRunResponse(value.agentRun)) &&
  (value.repositoryDiff === undefined ||
    isRepositoryDiff(value.repositoryDiff)) &&
  Array.isArray(value.verifications) &&
  value.verifications.every(isFeatureVerification) &&
  (value.operationErrors === undefined ||
    (Array.isArray(value.operationErrors) &&
      value.operationErrors.every((item) => typeof item === 'string'))) &&
  ['unknown', 'risky', 'reviewable', 'ready'].includes(
    String(value.readiness),
  ) &&
  Array.isArray(value.concerns) &&
  value.concerns.every((item) => typeof item === 'string') &&
  Array.isArray(value.recommendations) &&
  value.recommendations.every((item) => typeof item === 'string') &&
  (value.recommendedVerifications === undefined ||
    (Array.isArray(value.recommendedVerifications) &&
      value.recommendedVerifications.every(isRecommendedVerification))) &&
  typeof value.updatedAt === 'string'

const isRecommendedVerification = (
  value: unknown,
): value is RecommendedVerification =>
  isRecord(value) &&
  ['test', 'lint', 'typecheck', 'build'].includes(
    String(value.verificationType),
  ) &&
  typeof value.command === 'string' &&
  typeof value.reason === 'string' &&
  ['high', 'medium', 'low'].includes(String(value.priority)) &&
  ['not-run', 'passed', 'failed'].includes(String(value.status))

const isFeatureSeedOption = (
  value: unknown,
): value is FeatureSeedOption => {
  if (!isRecord(value) || !isRecord(value.effects)) return false
  const effects = value.effects

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.expectedImpact === 'string' &&
    typeof value.implementationHint === 'string' &&
    typeof value.risk === 'string' &&
    featureSeedCategories.includes(String(value.category)) &&
    featureSeedDifficulties.includes(String(value.difficulty)) &&
    ['completion', 'technicalDebt', 'stamina', 'motivation'].every(
      (key) =>
        effects[key] === undefined || typeof effects[key] === 'number',
    )
  )
}

const isFeatureSeed = (value: unknown): value is FeatureSeed =>
  isFeatureSeedOption(value) &&
  isRecord(value) &&
  featureSeedStatuses.includes(String(value.status)) &&
  typeof value.createdTurn === 'number' &&
  typeof value.selectedAt === 'string' &&
  (value.builtAt === undefined || typeof value.builtAt === 'string') &&
  (value.discardedAt === undefined ||
    typeof value.discardedAt === 'string') &&
  (value.discardReason === undefined ||
    typeof value.discardReason === 'string') &&
  (value.verificationStatus === undefined ||
    featureVerificationStatuses.includes(String(value.verificationStatus))) &&
  (value.verifications === undefined ||
    (Array.isArray(value.verifications) &&
      value.verifications.every(isFeatureVerification))) &&
  (value.completionSummary === undefined ||
    isFeatureCompletionSummary(value.completionSummary))

const isRunResult = (value: unknown): value is RunResult => {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    (value.turn === undefined || typeof value.turn === 'number') &&
    (value.turnAdvanced === undefined ||
      typeof value.turnAdvanced === 'boolean') &&
    COMMAND_TYPES.includes(
      value.commandType as (typeof COMMAND_TYPES)[number],
    ) &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    isRecord(value.statusChanges) &&
    Array.isArray(value.changedFiles) &&
    value.changedFiles.every((file) => typeof file === 'string') &&
    Array.isArray(value.logs) &&
    value.logs.every((log) => typeof log === 'string') &&
    typeof value.recommendation === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.featureSeedId === undefined ||
      typeof value.featureSeedId === 'string') &&
    (value.featureSeedTitle === undefined ||
      typeof value.featureSeedTitle === 'string') &&
    (value.gitDiff === undefined || isGitDiffSummary(value.gitDiff)) &&
    (value.verification === undefined ||
      isParsedVerificationResult(value.verification))
  )
}

const isGitDiffSummary = (value: unknown): value is GitDiffSummary => {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.changedFiles) &&
    value.changedFiles.every((file) => typeof file === 'string') &&
    typeof value.fileCount === 'number' &&
    typeof value.insertions === 'number' &&
    typeof value.deletions === 'number' &&
    typeof value.summaryText === 'string' &&
    ['low', 'medium', 'high'].includes(String(value.riskLevel))
  )
}

const isParsedVerificationResult = (
  value: unknown,
): value is ParsedVerificationResult => {
  if (!isRecord(value)) return false

  return (
    ['test', 'lint', 'typecheck', 'build'].includes(
      String(value.verificationType),
    ) &&
    typeof value.command === 'string' &&
    typeof value.success === 'boolean' &&
    typeof value.summaryText === 'string' &&
    typeof value.errorCount === 'number' &&
    typeof value.warningCount === 'number' &&
    ['low', 'medium', 'high'].includes(String(value.riskLevel)) &&
    Array.isArray(value.logs) &&
    value.logs.every((log) => typeof log === 'string')
  )
}

const isRunHistoryEntry = (value: unknown): value is RunHistoryEntry => {
  if (!isRecord(value)) return false

  return (
    isRunResult(value.result) &&
    typeof value.turn === 'number' &&
    MOTIVATIONS.includes(
      value.motivationBefore as (typeof MOTIVATIONS)[number],
    )
  )
}

const isPersistedAppState = (value: unknown): value is PersistedAppState => {
  if (!isRecord(value)) return false

  return (
    [1, 2, 3, 4, 5, 6, 7, 8, 9, STORAGE_VERSION].includes(
      Number(value.version),
    ) &&
    (value.isStarted === undefined || typeof value.isStarted === 'boolean') &&
    (value.projectConfig === undefined ||
      isProjectConfig(value.projectConfig)) &&
    isProjectStatus(value.projectStatus) &&
    Array.isArray(value.runHistory) &&
    value.runHistory.every(isRunHistoryEntry) &&
    (value.selectedResultId === null ||
      typeof value.selectedResultId === 'string') &&
    (value.featureSeeds === undefined ||
      (Array.isArray(value.featureSeeds) &&
        value.featureSeeds.every(isFeatureSeed))) &&
    (value.latestIdeaOptions === undefined ||
      (Array.isArray(value.latestIdeaOptions) &&
        value.latestIdeaOptions.every(isFeatureSeedOption))) &&
    (value.ideaGenerationInfo === undefined ||
      isIdeaGenerationInfo(value.ideaGenerationInfo)) &&
    (value.contextSummary === undefined ||
      isProjectContextSummary(value.contextSummary)) &&
    (value.latestReleaseJudgement === undefined ||
      isReleaseJudgement(value.latestReleaseJudgement)) &&
    (value.releaseJudgements === undefined ||
      (Array.isArray(value.releaseJudgements) &&
        value.releaseJudgements.every(isReleaseJudgement))) &&
    (value.scenarioConfig === undefined ||
      isScenarioConfig(value.scenarioConfig)) &&
    (value.scenarioStatus === undefined ||
      isScenarioStatus(value.scenarioStatus)) &&
    (value.scenarioResult === undefined ||
      isScenarioResult(value.scenarioResult)) &&
    (value.implementationReviews === undefined ||
      (Array.isArray(value.implementationReviews) &&
        value.implementationReviews.every(isImplementationReview))) &&
    (value.currentFeatureSeed === undefined ||
      isFeatureSeed(value.currentFeatureSeed)) &&
    (value.featureSeedHistory === undefined ||
      (Array.isArray(value.featureSeedHistory) &&
        value.featureSeedHistory.every(isFeatureSeed))) &&
    (value.featureSeedOptions === undefined ||
      (Array.isArray(value.featureSeedOptions) &&
        value.featureSeedOptions.every(isFeatureSeedOption)))
  )
}

export const loadAppState = (): PersistedAppState | null => {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY)
    if (!serialized) return null

    const parsed: unknown = JSON.parse(serialized)
    if (!isPersistedAppState(parsed)) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    const storedState = parsed as PersistedAppState & {
      isStarted?: boolean
      currentFeatureSeed?: FeatureSeed
      featureSeedHistory?: FeatureSeed[]
      featureSeedOptions?: FeatureSeedOption[]
    }

    const legacyAppName =
      isRecord(storedState.projectStatus) &&
      typeof storedState.projectStatus.appName === 'string'
        ? storedState.projectStatus.appName
        : initialProjectConfig.appName
    const {
      appName: _legacyAppName,
      ...projectStatus
    } = storedState.projectStatus as ProjectStatus & { appName?: string }
    void _legacyAppName

    const storedSeeds =
      Array.isArray(storedState.featureSeeds) &&
      storedState.featureSeeds.every(isFeatureSeed)
        ? storedState.featureSeeds
        : []
    const legacyHistory =
      Array.isArray(storedState.featureSeedHistory) &&
      storedState.featureSeedHistory.every(isFeatureSeed)
        ? storedState.featureSeedHistory
        : []
    const legacyCurrent = isFeatureSeed(storedState.currentFeatureSeed)
      ? storedState.currentFeatureSeed
      : undefined
    const featureSeeds = [...storedSeeds, ...legacyHistory]
    if (
      legacyCurrent &&
      !featureSeeds.some((seed) => seed.id === legacyCurrent.id)
    ) {
      featureSeeds.unshift(legacyCurrent)
    }
    let plannedSeedCount = 0
    const normalizedFeatureSeeds = featureSeeds.map((seed) => {
      const verificationReadySeed =
        seed.status === 'built'
          ? {
              ...seed,
              verificationStatus: seed.verificationStatus ?? 'unchecked',
              verifications: seed.verifications ?? [],
            }
          : seed
      if (verificationReadySeed.status !== 'planned') {
        return verificationReadySeed
      }
      plannedSeedCount += 1
      return plannedSeedCount <= 3
        ? verificationReadySeed
        : { ...verificationReadySeed, status: 'discarded' as const }
    })
    const normalizedRunHistory = storedState.runHistory.map((entry) => ({
      ...entry,
      result: {
        ...entry.result,
        turn: entry.result.turn ?? entry.turn,
      },
    }))

    const normalizedProjectConfig = isProjectConfig(storedState.projectConfig)
      ? {
          ...initialProjectConfig,
          ...storedState.projectConfig,
          verificationCommands: {
            ...initialProjectConfig.verificationCommands,
            ...storedState.projectConfig.verificationCommands,
          },
          agentCommandConfig: {
            ...initialProjectConfig.agentCommandConfig,
            ...storedState.projectConfig.agentCommandConfig,
            codexCommand:
              storedState.projectConfig.agentCommandConfig?.codexCommand?.trim() ||
              initialProjectConfig.agentCommandConfig.codexCommand,
            codexArgs:
              storedState.projectConfig.agentCommandConfig?.codexArgs?.trim() ||
              initialProjectConfig.agentCommandConfig.codexArgs,
          },
        }
      : { ...initialProjectConfig, appName: legacyAppName }

    return {
      ...storedState,
      isStarted: storedState.isStarted ?? true,
      projectStatus,
      projectConfig: normalizedProjectConfig,
      featureSeeds: normalizedFeatureSeeds.filter(
        (seed, index, seeds) =>
          seeds.findIndex((candidate) => candidate.id === seed.id) === index,
      ),
      latestIdeaOptions:
        Array.isArray(storedState.latestIdeaOptions) &&
        storedState.latestIdeaOptions.every(isFeatureSeedOption)
          ? storedState.latestIdeaOptions
          : Array.isArray(storedState.featureSeedOptions) &&
              storedState.featureSeedOptions.every(isFeatureSeedOption)
          ? storedState.featureSeedOptions
            : [],
      ideaGenerationInfo: isIdeaGenerationInfo(
        storedState.ideaGenerationInfo,
      )
        ? {
            ...storedState.ideaGenerationInfo,
            warnings: storedState.ideaGenerationInfo.warnings ?? [],
          }
        : undefined,
      latestReleaseJudgement: isReleaseJudgement(
        storedState.latestReleaseJudgement,
      )
        ? storedState.latestReleaseJudgement
        : undefined,
      releaseJudgements:
        Array.isArray(storedState.releaseJudgements) &&
        storedState.releaseJudgements.every(isReleaseJudgement)
          ? storedState.releaseJudgements
          : [],
      scenarioConfig: isScenarioConfig(storedState.scenarioConfig)
        ? storedState.scenarioConfig
        : createInitialScenarioConfig(normalizedProjectConfig),
      scenarioStatus: isScenarioStatus(storedState.scenarioStatus)
        ? storedState.scenarioStatus
        : 'playing',
      scenarioResult: isScenarioResult(storedState.scenarioResult)
        ? storedState.scenarioResult
        : undefined,
      implementationReviews:
        Array.isArray(storedState.implementationReviews) &&
        storedState.implementationReviews.every(isImplementationReview)
          ? storedState.implementationReviews
          : [],
      runHistory: normalizedRunHistory,
    }
  } catch {
    return null
  }
}

export const saveAppState = (
  state: Omit<
    PersistedAppState,
    | 'version'
    | 'isStarted'
    | 'latestReleaseJudgement'
    | 'releaseJudgements'
    | 'scenarioConfig'
    | 'scenarioStatus'
    | 'scenarioResult'
    | 'implementationReviews'
    | 'ideaGenerationInfo'
  > & {
    isStarted?: boolean
    latestReleaseJudgement?: ReleaseJudgement
    releaseJudgements?: ReleaseJudgement[]
    scenarioConfig?: ScenarioConfig
    scenarioStatus?: ScenarioStatus
    scenarioResult?: ScenarioResult
    implementationReviews?: ImplementationReview[]
    ideaGenerationInfo?: IdeaGenerationInfo
  },
): void => {
  try {
    const currentSerialized = localStorage.getItem(STORAGE_KEY)
    const current: unknown = currentSerialized
      ? JSON.parse(currentSerialized)
      : undefined
    const currentLatest =
      isRecord(current) && isReleaseJudgement(current.latestReleaseJudgement)
        ? current.latestReleaseJudgement
        : undefined
    const currentJudgements =
      isRecord(current) &&
      Array.isArray(current.releaseJudgements) &&
      current.releaseJudgements.every(isReleaseJudgement)
        ? current.releaseJudgements
        : []
    const resetsReleaseHistory =
      state.releaseJudgements !== undefined &&
      state.releaseJudgements.length === 0
    const currentScenarioConfig =
      isRecord(current) && isScenarioConfig(current.scenarioConfig)
        ? current.scenarioConfig
        : createInitialScenarioConfig(state.projectConfig)
    const currentScenarioStatus =
      isRecord(current) && isScenarioStatus(current.scenarioStatus)
        ? current.scenarioStatus
        : 'playing'
    const currentScenarioResult =
      isRecord(current) && isScenarioResult(current.scenarioResult)
        ? current.scenarioResult
        : undefined
    const currentImplementationReviews =
      isRecord(current) &&
      Array.isArray(current.implementationReviews) &&
      current.implementationReviews.every(isImplementationReview)
        ? current.implementationReviews
        : []
    const currentIdeaGenerationInfo =
      isRecord(current) && isIdeaGenerationInfo(current.ideaGenerationInfo)
        ? current.ideaGenerationInfo
        : undefined

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        latestReleaseJudgement:
          state.latestReleaseJudgement ??
          (resetsReleaseHistory ? undefined : currentLatest),
        releaseJudgements:
          state.releaseJudgements ?? currentJudgements,
        scenarioConfig: state.scenarioConfig ?? currentScenarioConfig,
        scenarioStatus: state.scenarioStatus ?? currentScenarioStatus,
        scenarioResult:
          state.scenarioResult ??
          (state.scenarioStatus === 'playing'
            ? undefined
            : currentScenarioResult),
        implementationReviews:
          state.implementationReviews ?? currentImplementationReviews,
        ideaGenerationInfo:
          state.ideaGenerationInfo ?? currentIdeaGenerationInfo,
        isStarted: state.isStarted ?? true,
        version: STORAGE_VERSION,
      }),
    )
  } catch {
    // Storage availability and quota differ by browser. The app remains usable
    // in memory even when persistence is unavailable.
  }
}

export const clearAppState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(PLAYTEST_CHECKLIST_STORAGE_KEY)
    clearSetupState()
  } catch {
    // The in-memory reset still succeeds if storage is unavailable.
  }
}

export const importAppState = (
  serialized: string,
): { state?: PersistedAppState; error?: string } => {
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!isPersistedAppState(parsed)) {
      return {
        error:
          'DevSuccessStateの必須項目または型が正しくありません。',
      }
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...parsed, version: STORAGE_VERSION }),
    )
    const state = loadAppState()
    if (!state) {
      return { error: '状態を復元できませんでした。' }
    }
    return { state }
  } catch (error) {
    return {
      error:
        error instanceof SyntaxError
          ? 'JSONを解析できませんでした。'
          : '状態のインポートに失敗しました。',
    }
  }
}
