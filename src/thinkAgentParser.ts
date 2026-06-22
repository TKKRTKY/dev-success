import type {
  FeatureSeed,
  FeatureSeedOption,
  ThinkAgentResponse,
} from './domain/types'
import {
  extractJsonObject,
  repairThinkAgentOptions,
  safeParseJson,
} from './aiJsonUtils'
import type { ThinkRepairResult } from './aiJsonUtils'

export type ParsedThinkAgentResponse = ThinkRepairResult

export { extractJsonObject, safeParseJson }

export const parseThinkAgentResponse = (
  rawOutput: string,
  plannedFeatureSeeds: Array<Pick<FeatureSeed, 'title'> | string>,
  fallbackOptions: FeatureSeedOption[],
): ParsedThinkAgentResponse =>
  repairThinkAgentOptions(rawOutput, {
    plannedFeatureSeeds,
    fallbackOptions,
  })

export const parseThinkAgentApiResponse = (
  response: ThinkAgentResponse,
  plannedFeatureSeeds: Array<Pick<FeatureSeed, 'title'> | string>,
  fallbackOptions: FeatureSeedOption[],
): ParsedThinkAgentResponse => {
  if (!response.success) {
    const repaired = repairThinkAgentOptions('', {
      plannedFeatureSeeds,
      fallbackOptions,
    })
    return {
      ...repaired,
      warnings: [
        response.error ||
          'AI候補生成に失敗したためローカル候補を使用しました。',
        ...repaired.warnings,
      ],
    }
  }
  return repairThinkAgentOptions(
    response.rawOutput || JSON.stringify({ options: response.options }),
    {
      plannedFeatureSeeds,
      fallbackOptions,
    },
  )
}
