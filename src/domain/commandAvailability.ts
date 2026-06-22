import type {
  CommandAvailability,
  FeatureSeed,
  ScenarioStatus,
} from './types'

export interface CommandAvailabilityState {
  featureSeeds: FeatureSeed[]
  scenarioStatus?: ScenarioStatus
}

export const getCommandAvailability = ({
  featureSeeds,
  scenarioStatus = 'playing',
}: CommandAvailabilityState): CommandAvailability => {
  if (scenarioStatus === 'completed') {
    const completed = {
      enabled: false,
      reason:
        'シナリオは完了しています。「はじめから」で新しい挑戦を始められます。',
    }
    return {
      think: completed,
      build: completed,
      verify: completed,
      organize: completed,
    }
  }

  const plannedCount = featureSeeds.filter(
    (seed) => seed.status === 'planned',
  ).length
  const hasBuilding = featureSeeds.some(
    (seed) => seed.status === 'building',
  )
  const hasBuilt = featureSeeds.some((seed) => seed.status === 'built')

  return {
    think:
      plannedCount < 3
        ? { enabled: true }
        : {
            enabled: false,
            reason:
              '機能の元がいっぱいです。先に作るでどれかを育てましょう。',
          },
    build: hasBuilding
      ? {
          enabled: false,
          reason:
            '現在実装中の機能があります。先に結果を取り込むか、中断してください。',
        }
      : plannedCount > 0
        ? { enabled: true }
        : {
            enabled: false,
            reason:
              'まだ機能の元がありません。まずは考えるで次に育てる機能を見つけましょう。',
          },
    verify: hasBuilt
      ? { enabled: true }
      : {
          enabled: false,
          reason:
            'まだ確かめる機能がありません。まずは作るで機能を完成させましょう。',
        },
    organize: { enabled: true },
  }
}
