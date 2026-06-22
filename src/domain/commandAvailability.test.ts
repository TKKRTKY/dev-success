import { describe, expect, it } from 'vitest'
import { getCommandAvailability } from './commandAvailability'
import type { FeatureSeed } from './types'

const seed = (status: FeatureSeed['status'], id: string): FeatureSeed => ({
  id,
  title: `seed-${id}`,
  description: 'description',
  expectedImpact: 'impact',
  implementationHint: 'hint',
  risk: 'low',
  category: 'feature',
  difficulty: 'small',
  effects: {},
  status,
  createdTurn: 1,
  selectedAt: new Date(0).toISOString(),
})

describe('getCommandAvailability', () => {
  it('plannedが3件なら考えるを止め、作るを有効にする', () => {
    const result = getCommandAvailability({
      featureSeeds: [seed('planned', '1'), seed('planned', '2'), seed('planned', '3')],
      scenarioStatus: 'playing',
    })
    expect(result.think.enabled).toBe(false)
    expect(result.build.enabled).toBe(true)
  })

  it('building中は作るを止める', () => {
    const result = getCommandAvailability({
      featureSeeds: [seed('planned', '1'), seed('building', '2')],
    })
    expect(result.build.enabled).toBe(false)
    expect(result.build.reason).toContain('実装中')
  })

  it('シナリオ完了後は全コマンドを止める', () => {
    const result = getCommandAvailability({
      featureSeeds: [seed('built', '1')],
      scenarioStatus: 'completed',
    })
    expect(Object.values(result).every((item) => !item.enabled)).toBe(true)
  })
})
