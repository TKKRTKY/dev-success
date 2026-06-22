import { initialProjectConfig } from './domain/projectConfig'
import type {
  ProjectConfig,
  ProjectSetupDraft,
} from './domain/types'

export interface AppliedProjectSetupDraft {
  projectConfig: ProjectConfig
  scenarioMaxTurn: number
}

const keepOrDefault = (
  draftValue: string | undefined,
  currentValue: string,
  defaultValue = '',
): string => draftValue?.trim() || currentValue.trim() || defaultValue

export const applyProjectSetupDraft = (
  current: ProjectConfig,
  currentScenarioMaxTurn: number,
  draft: ProjectSetupDraft,
): AppliedProjectSetupDraft => ({
  projectConfig: {
    ...current,
    appName: keepOrDefault(
      draft.appName,
      current.appName,
      initialProjectConfig.appName,
    ),
    productVision: keepOrDefault(
      draft.productVision,
      current.productVision,
    ),
    targetUser: keepOrDefault(draft.targetUser, current.targetUser),
    problemStatement: keepOrDefault(
      draft.problemStatement,
      current.problemStatement,
    ),
    initialGoal: keepOrDefault(draft.initialGoal, current.initialGoal),
    techStack: keepOrDefault(
      draft.techStack,
      current.techStack,
      initialProjectConfig.techStack,
    ),
    repositoryPath: keepOrDefault(
      draft.repositoryPath,
      current.repositoryPath,
    ),
    packageManager:
      draft.packageManager ??
      current.packageManager ??
      initialProjectConfig.packageManager,
    defaultAgent:
      draft.defaultAgent ??
      current.defaultAgent ??
      initialProjectConfig.defaultAgent,
    developmentStyle:
      draft.developmentStyle ??
      current.developmentStyle ??
      initialProjectConfig.developmentStyle,
    verificationCommands: {
      test: keepOrDefault(
        draft.verificationCommands?.test,
        current.verificationCommands.test,
        initialProjectConfig.verificationCommands.test,
      ),
      lint: keepOrDefault(
        draft.verificationCommands?.lint,
        current.verificationCommands.lint,
        initialProjectConfig.verificationCommands.lint,
      ),
      typecheck: keepOrDefault(
        draft.verificationCommands?.typecheck,
        current.verificationCommands.typecheck,
        initialProjectConfig.verificationCommands.typecheck,
      ),
      build: keepOrDefault(
        draft.verificationCommands?.build,
        current.verificationCommands.build,
        initialProjectConfig.verificationCommands.build,
      ),
    },
  },
  scenarioMaxTurn:
    draft.scenarioMaxTurn || currentScenarioMaxTurn || 12,
})

export const createEditableProjectSetupDraft = (
  current: ProjectConfig,
  currentScenarioMaxTurn: number,
  draft: ProjectSetupDraft,
): ProjectSetupDraft => {
  const applied = applyProjectSetupDraft(
    current,
    currentScenarioMaxTurn,
    draft,
  )
  return {
    appName: applied.projectConfig.appName,
    productVision: applied.projectConfig.productVision,
    targetUser: applied.projectConfig.targetUser,
    problemStatement: applied.projectConfig.problemStatement,
    initialGoal: applied.projectConfig.initialGoal,
    techStack: applied.projectConfig.techStack,
    repositoryPath: applied.projectConfig.repositoryPath,
    packageManager: applied.projectConfig.packageManager,
    defaultAgent: applied.projectConfig.defaultAgent,
    developmentStyle: applied.projectConfig.developmentStyle,
    scenarioMaxTurn: applied.scenarioMaxTurn,
    verificationCommands: {
      ...applied.projectConfig.verificationCommands,
    },
    assumptions: [...draft.assumptions],
    questions: [...draft.questions],
    confidence: draft.confidence,
  }
}
