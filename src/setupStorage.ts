import type { ProjectSetupDraft } from './domain/types'

const SETUP_STORAGE_KEY = 'dev-success:setup-state'

export interface SetupState {
  rawInput: string
  additionalAnswer: string
  draft?: ProjectSetupDraft
  assistantMessage: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isSetupDraft = (value: unknown): value is ProjectSetupDraft => {
  if (!isRecord(value)) return false
  const optionalStrings = [
    'appName',
    'productVision',
    'targetUser',
    'problemStatement',
    'initialGoal',
    'techStack',
    'repositoryPath',
  ]
  const verificationCommands = value.verificationCommands
  return (
    optionalStrings.every(
      (key) => value[key] === undefined || typeof value[key] === 'string',
    ) &&
    (value.packageManager === undefined ||
      ['npm', 'pnpm', 'yarn', 'bun', 'other'].includes(
        String(value.packageManager),
      )) &&
    (value.defaultAgent === undefined ||
      [
        'codex',
        'claude-code',
        'opencode',
        'cursor',
        'devin',
        'manual',
        'other',
      ].includes(String(value.defaultAgent))) &&
    (value.developmentStyle === undefined ||
      ['safe', 'fast', 'experimental', 'quality-focused'].includes(
        String(value.developmentStyle),
      )) &&
    (value.scenarioMaxTurn === undefined ||
      typeof value.scenarioMaxTurn === 'number') &&
    (verificationCommands === undefined ||
      (isRecord(verificationCommands) &&
        ['test', 'lint', 'typecheck', 'build'].every(
          (type) => typeof verificationCommands[type] === 'string',
        ))) &&
    isStringArray(value.assumptions) &&
    isStringArray(value.questions) &&
    typeof value.confidence === 'number'
  )
}

export const loadSetupState = (): SetupState | null => {
  try {
    const serialized = localStorage.getItem(SETUP_STORAGE_KEY)
    if (!serialized) return null
    const parsed: unknown = JSON.parse(serialized)
    if (
      !isRecord(parsed) ||
      typeof parsed.rawInput !== 'string' ||
      typeof parsed.additionalAnswer !== 'string' ||
      typeof parsed.assistantMessage !== 'string' ||
      (parsed.draft !== undefined && !isSetupDraft(parsed.draft))
    ) {
      localStorage.removeItem(SETUP_STORAGE_KEY)
      return null
    }
    return parsed as unknown as SetupState
  } catch {
    return null
  }
}

export const saveSetupState = (state: SetupState): void => {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The setup flow remains usable in memory when storage is unavailable.
  }
}

export const clearSetupState = (): void => {
  try {
    localStorage.removeItem(SETUP_STORAGE_KEY)
  } catch {
    // In-memory reset still succeeds.
  }
}
