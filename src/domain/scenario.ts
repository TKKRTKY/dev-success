import type { ProjectConfig, ScenarioConfig } from './types'

export const DEFAULT_SCENARIO_GOAL =
  'MVPをβ版として公開できる状態にする'

export const createInitialScenarioConfig = (
  projectConfig: ProjectConfig,
  maxTurn = 12,
): ScenarioConfig => ({
  maxTurn,
  goal: projectConfig.initialGoal.trim() || DEFAULT_SCENARIO_GOAL,
})
