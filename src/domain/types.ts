export const COMMANDS = ['think', 'build', 'verify', 'organize'] as const

export const COMMAND_TYPES = [...COMMANDS, 'check', 'release'] as const

export type CommandType = (typeof COMMAND_TYPES)[number]

export const MOTIVATIONS = [
  '絶不調',
  '不調',
  '普通',
  '好調',
  '絶好調',
] as const

export type Motivation = (typeof MOTIVATIONS)[number]

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'other'

export type DevelopmentStyle =
  | 'safe'
  | 'fast'
  | 'experimental'
  | 'quality-focused'

export type AgentKind =
  | 'codex'
  | 'claude-code'
  | 'opencode'
  | 'cursor'
  | 'devin'
  | 'manual'
  | 'other'

export interface AgentCommandConfig {
  codexCommand: string
  codexArgs: string
}

export interface AgentRunRequest {
  agentKind: AgentKind
  repositoryPath: string
  prompt: string
  featureSeedId?: string
}

export interface AgentRunResponse {
  agentKind: AgentKind
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  error?: string
}

export interface AgentConnectionResponse {
  success: boolean
  command: string
  args: string
  version?: string
  stdout: string
  stderr: string
  durationMs: number
  error?: string
}

export interface ThinkAgentResponse {
  success: boolean
  options: FeatureSeedOption[]
  rawOutput: string
  source?: IdeaGenerationSource
  warnings?: string[]
  error?: string
}

export type IdeaGenerationSource =
  | 'ai'
  | 'repaired'
  | 'fallback'
  | 'mixed'

export interface IdeaGenerationInfo {
  source: IdeaGenerationSource
  rawOutput: string
  warnings: string[]
  error?: string
  generatedAt: string
}

export type ImplementationReadiness =
  | 'unknown'
  | 'risky'
  | 'reviewable'
  | 'ready'

export interface RecommendedVerification {
  verificationType: VerificationType
  command: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  status: 'not-run' | 'passed' | 'failed'
}

export interface ImplementationReview {
  featureSeedId: string
  agentRun?: AgentRunResponse
  repositoryDiff?: RepositoryDiff
  verifications: FeatureVerification[]
  operationErrors?: string[]
  readiness: ImplementationReadiness
  concerns: string[]
  recommendations: string[]
  recommendedVerifications?: RecommendedVerification[]
  updatedAt: string
}

export interface AgentCliAdapter<
  Request extends AgentRunRequest = AgentRunRequest,
> {
  run(request: Request): Promise<AgentRunResponse>
}

export interface VerificationCommands {
  test: string
  lint: string
  typecheck: string
  build: string
}

export interface ProjectConfig {
  appName: string
  productVision: string
  targetUser: string
  problemStatement: string
  initialGoal: string
  repositoryPath: string
  techStack: string
  packageManager: PackageManager
  defaultAgent: AgentKind
  developmentStyle: DevelopmentStyle
  agentCommandConfig: AgentCommandConfig
  agentTimeoutMs: number
  verificationCommands: VerificationCommands
}

export interface ProjectSetupDraft {
  appName?: string
  productVision?: string
  targetUser?: string
  problemStatement?: string
  initialGoal?: string
  techStack?: string
  repositoryPath?: string
  packageManager?: PackageManager
  defaultAgent?: AgentKind
  developmentStyle?: DevelopmentStyle
  scenarioMaxTurn?: number
  verificationCommands?: VerificationCommands
  assumptions: string[]
  questions: string[]
  confidence: number
}

export interface SetupParseResponse {
  success: boolean
  draft?: ProjectSetupDraft
  assistantMessage: string
  rawOutput?: string
  error?: string
}

export interface RepositoryStatus {
  exists: boolean
  isDirectory: boolean
  isGitRepository: boolean
  currentBranch?: string
  changedFiles: string[]
  statusText?: string
  error?: string
}

export interface RepositoryDiff {
  changedFiles: string[]
  nameOnlyText: string
  statText: string
  insertions: number
  deletions: number
  fileCount: number
  riskLevel: GitDiffRiskLevel
  error?: string
}

export interface ProjectStatus {
  turn: number
  completion: number
  stamina: number
  motivation: Motivation
  technicalDebt: number
}

export interface StatusChanges {
  completion?: number
  stamina?: number
  motivation?: number
  technicalDebt?: number
}

export type FeatureSeedCategory =
  | 'feature'
  | 'ui'
  | 'test'
  | 'refactor'
  | 'documentation'
  | 'developer-experience'

export type FeatureSeedDifficulty = 'small' | 'medium' | 'large'

export type FeatureSeedStatus =
  | 'planned'
  | 'building'
  | 'built'
  | 'discarded'

export type FeatureVerificationStatus =
  | 'unchecked'
  | 'passed'
  | 'failed'
  | 'partial'

export interface FeatureVerification {
  verificationType: VerificationType
  command: string
  success: boolean
  checkedAt: string
  summaryText: string
  runResultId?: string
}

export interface FeatureCompletionSummary {
  featureSeedId: string
  title: string
  completedAt: string
  summary: string
  changedFiles: string[]
  verificationSummary: string[]
  concerns: string[]
  recommendations: string[]
  readiness: ImplementationReadiness
}

export interface FeatureSeedOption {
  id: string
  title: string
  description: string
  expectedImpact: string
  implementationHint: string
  risk: string
  category: FeatureSeedCategory
  difficulty: FeatureSeedDifficulty
  effects: StatusChanges
}

export interface FeatureSeed extends FeatureSeedOption {
  status: FeatureSeedStatus
  createdTurn: number
  selectedAt: string
  builtAt?: string
  discardedAt?: string
  discardReason?: string
  verificationStatus?: FeatureVerificationStatus
  verifications?: FeatureVerification[]
  completionSummary?: FeatureCompletionSummary
}

export interface ProjectContextSummary {
  generatedAt: string
  turn: number
  summary: string
  recentProgress: string[]
  openConcerns: string[]
  suggestedFocus: FeatureSeedCategory[]
  nextThinkHints: string[]
}

export type ReleaseRank = 'S' | 'A' | 'B' | 'C' | 'D'

export interface ReleaseJudgement {
  id: string
  createdAt: string
  turn: number
  rank: ReleaseRank
  score: number
  summary: string
  strengths: string[]
  concerns: string[]
  recommendations: string[]
}

export type ScenarioStatus = 'playing' | 'completed'

export interface ScenarioConfig {
  maxTurn: number
  goal: string
}

export interface ScenarioResult {
  completedAt: string
  finalTurn: number
  releaseJudgementId?: string
  rank: ReleaseRank
  summary: string
}

export type StateValidationSeverity = 'info' | 'warning' | 'error'

export interface StateValidationIssue {
  severity: StateValidationSeverity
  message: string
  path?: string
}

export interface StateValidationResult {
  ok: boolean
  errorCount: number
  warningCount: number
  infoCount: number
  issues: StateValidationIssue[]
}

export interface CommandAvailabilityItem {
  enabled: boolean
  reason?: string
}

export interface CommandAvailability {
  think: CommandAvailabilityItem
  build: CommandAvailabilityItem
  verify: CommandAvailabilityItem
  organize: CommandAvailabilityItem
}

export type GitDiffRiskLevel = 'low' | 'medium' | 'high'

export interface GitDiffSummary {
  changedFiles: string[]
  fileCount: number
  insertions: number
  deletions: number
  summaryText: string
  riskLevel: GitDiffRiskLevel
}

export type VerificationType = 'test' | 'lint' | 'typecheck' | 'build'

export type VerificationRiskLevel = 'low' | 'medium' | 'high'

export interface ParsedVerificationResult {
  verificationType: VerificationType
  command: string
  success: boolean
  summaryText: string
  errorCount: number
  warningCount: number
  riskLevel: VerificationRiskLevel
  logs: string[]
}

export interface VerifyRepositoryResponse {
  verificationType: VerificationType
  command: string
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  summaryText: string
  errorCount: number
  warningCount: number
  riskLevel: VerificationRiskLevel
  error?: string
}

export interface CommandDefinition {
  id: CommandType
  label: string
  description: string
  icon: string
  summary: string
  recommendation: string
  statusChanges: StatusChanges
  changedFiles: string[]
  logs: string[]
}

export interface RunResult {
  id: string
  turn: number
  turnAdvanced?: boolean
  commandType: CommandType
  title: string
  summary: string
  statusChanges: StatusChanges
  changedFiles: string[]
  logs: string[]
  recommendation: string
  createdAt: string
  featureSeedId?: string
  featureSeedTitle?: string
  gitDiff?: GitDiffSummary
  verification?: ParsedVerificationResult
}

export interface RunHistoryEntry {
  result: RunResult
  turn: number
  motivationBefore: Motivation
}

export interface AgentRunInput {
  commandType: CommandType
  projectStatus: ProjectStatus
  featureSeed?: FeatureSeed
}

export interface AgentAdapter {
  run(input: AgentRunInput): Promise<RunResult>
}
