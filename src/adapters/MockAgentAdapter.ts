import { commandDefinitions } from '../domain/commands'
import { getActualStatusChanges } from '../domain/status'
import type {
  AgentAdapter,
  AgentRunInput,
  RunResult,
} from '../domain/types'

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export class MockAgentAdapter implements AgentAdapter {
  async run(input: AgentRunInput): Promise<RunResult> {
    await wait(420)

    const definition = commandDefinitions[input.commandType]
    const featureSeed =
      input.commandType === 'build' ? input.featureSeed : undefined
    const isFeatureBuild = featureSeed !== undefined
    const requestedChanges = isFeatureBuild
      ? featureSeed.effects
      : definition.statusChanges
    const statusChanges = getActualStatusChanges(
      input.projectStatus,
      requestedChanges,
    )

    return {
      id: crypto.randomUUID(),
      turn: input.projectStatus.turn + 1,
      commandType: input.commandType,
      title: isFeatureBuild
        ? `「${featureSeed.title}」を育てた！`
        : `「${definition.label}」を実行した！`,
      summary: isFeatureBuild
        ? `${featureSeed.description} 実装のもとになる変更をmockで反映した。`
        : definition.summary,
      statusChanges,
      changedFiles: isFeatureBuild
        ? [`src/features/${featureSeed.id}.ts`]
        : definition.changedFiles,
      logs: isFeatureBuild
        ? [
            `feature seed: ${featureSeed.title}`,
            `implementation hint: ${featureSeed.implementationHint}`,
            `risk: ${featureSeed.risk}`,
          ]
        : definition.logs,
      recommendation: isFeatureBuild
        ? '機能のもとを育てました。次は「確かめる」で動作を確認しましょう。'
        : definition.recommendation,
      createdAt: new Date().toISOString(),
    }
  }
}
