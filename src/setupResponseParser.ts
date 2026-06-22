import type {
  AgentKind,
  DevelopmentStyle,
  PackageManager,
  ProjectSetupDraft,
  SetupParseResponse,
  VerificationCommands,
} from './domain/types'
import { safeParseJson } from './aiJsonUtils'

const packageManagers = new Set<PackageManager>([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'other',
])
const agentKinds = new Set<AgentKind>([
  'codex',
  'claude-code',
  'opencode',
  'cursor',
  'devin',
  'manual',
  'other',
])
const developmentStyles = new Set<DevelopmentStyle>([
  'safe',
  'fast',
  'experimental',
  'quality-focused',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const optionalString = (
  value: unknown,
  field: string,
): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${field}は文字列である必要があります。`)
  }
  return value.trim() || undefined
}

const stringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${field}は文字列配列である必要があります。`)
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

const parseVerificationCommands = (
  value: unknown,
): VerificationCommands | undefined => {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error('verificationCommandsが不正です。')
  }
  const types = ['test', 'lint', 'typecheck', 'build'] as const
  const entries = types.map((type) => {
    if (typeof value[type] !== 'string') {
      throw new Error(`verificationCommands.${type}は文字列である必要があります。`)
    }
    return [type, value[type].trim()] as const
  })
  return Object.fromEntries(entries) as unknown as VerificationCommands
}

export const parseSetupResponse = (rawOutput: string): SetupParseResponse => {
  const parsed = safeParseJson(rawOutput)
  if (!parsed) throw new Error('AI出力のJSONを解析・修復できませんでした。')
  if (!isRecord(parsed) || !isRecord(parsed.draft)) {
    throw new Error('draftオブジェクトがありません。')
  }

  const value = parsed.draft
  const packageManager = value.packageManager
  const defaultAgent = value.defaultAgent
  const developmentStyle = value.developmentStyle
  const scenarioMaxTurn = value.scenarioMaxTurn
  const confidence = value.confidence

  if (
    packageManager !== undefined &&
    !packageManagers.has(packageManager as PackageManager)
  ) {
    throw new Error('packageManagerが許可された値ではありません。')
  }
  if (
    defaultAgent !== undefined &&
    !agentKinds.has(defaultAgent as AgentKind)
  ) {
    throw new Error('defaultAgentが許可された値ではありません。')
  }
  if (
    developmentStyle !== undefined &&
    !developmentStyles.has(developmentStyle as DevelopmentStyle)
  ) {
    throw new Error('developmentStyleが許可された値ではありません。')
  }
  if (
    scenarioMaxTurn !== undefined &&
    (typeof scenarioMaxTurn !== 'number' ||
      !Number.isFinite(scenarioMaxTurn) ||
      scenarioMaxTurn < 1)
  ) {
    throw new Error('scenarioMaxTurnは1以上の数値である必要があります。')
  }
  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error('confidenceは0から1の数値である必要があります。')
  }
  if (typeof parsed.assistantMessage !== 'string') {
    throw new Error('assistantMessageは文字列である必要があります。')
  }

  const draft: ProjectSetupDraft = {
    appName: optionalString(value.appName, 'appName'),
    productVision: optionalString(value.productVision, 'productVision'),
    targetUser: optionalString(value.targetUser, 'targetUser'),
    problemStatement: optionalString(
      value.problemStatement,
      'problemStatement',
    ),
    initialGoal: optionalString(value.initialGoal, 'initialGoal'),
    techStack: optionalString(value.techStack, 'techStack'),
    repositoryPath: optionalString(value.repositoryPath, 'repositoryPath'),
    packageManager: packageManager as PackageManager | undefined,
    defaultAgent: defaultAgent as AgentKind | undefined,
    developmentStyle: developmentStyle as DevelopmentStyle | undefined,
    scenarioMaxTurn: scenarioMaxTurn as number | undefined,
    verificationCommands: parseVerificationCommands(
      value.verificationCommands,
    ),
    assumptions: stringArray(value.assumptions, 'assumptions'),
    questions: stringArray(value.questions, 'questions'),
    confidence,
  }

  return {
    success: true,
    draft,
    assistantMessage: parsed.assistantMessage.trim(),
    rawOutput,
  }
}
