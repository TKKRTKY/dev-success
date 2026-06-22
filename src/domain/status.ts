import { MOTIVATIONS } from './types'
import type {
  Motivation,
  ProjectStatus,
  RunResult,
  StatusChanges,
} from './types'

export const initialProjectStatus: ProjectStatus = {
  turn: 1,
  completion: 10,
  stamina: 100,
  motivation: '普通',
  technicalDebt: 0,
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const updateMotivation = (
  motivation: Motivation,
  change = 0,
): Motivation => {
  const currentIndex = MOTIVATIONS.indexOf(motivation)
  return MOTIVATIONS[clamp(currentIndex + change, 0, MOTIVATIONS.length - 1)]
}

export const applyStatusChanges = (
  status: ProjectStatus,
  changes: StatusChanges,
): ProjectStatus => ({
  ...status,
  turn: status.turn + 1,
  completion: clamp(status.completion + (changes.completion ?? 0), 0, 100),
  stamina: clamp(status.stamina + (changes.stamina ?? 0), 0, 100),
  motivation: updateMotivation(status.motivation, changes.motivation),
  technicalDebt: Math.max(
    0,
    status.technicalDebt + (changes.technicalDebt ?? 0),
  ),
})

export const applyRunResult = (
  status: ProjectStatus,
  result: RunResult,
): ProjectStatus => applyStatusChanges(status, result.statusChanges)

export const getActualStatusChanges = (
  before: ProjectStatus,
  requestedChanges: StatusChanges,
): StatusChanges => {
  const after = applyStatusChanges(before, requestedChanges)
  return {
    completion: after.completion - before.completion,
    stamina: after.stamina - before.stamina,
    motivation:
      MOTIVATIONS.indexOf(after.motivation) -
      MOTIVATIONS.indexOf(before.motivation),
    technicalDebt: after.technicalDebt - before.technicalDebt,
  }
}

export const formatStatusChanges = (
  changes: StatusChanges,
  beforeMotivation?: Motivation,
): string[] => {
  const labels: string[] = []
  const addNumberChange = (label: string, from: number, to: number) => {
    const amount = to - from
    if (amount !== 0) {
      labels.push(`${label} ${amount > 0 ? '+' : ''}${amount}`)
    }
  }

  addNumberChange('完成度', 0, changes.completion ?? 0)
  addNumberChange('体力', 0, changes.stamina ?? 0)
  addNumberChange('技術的負債', 0, changes.technicalDebt ?? 0)

  if (beforeMotivation && changes.motivation) {
    const nextMotivation = updateMotivation(
      beforeMotivation,
      changes.motivation,
    )
    labels.push(`やる気 ${beforeMotivation} → ${nextMotivation}`)
  }

  return labels.length > 0 ? labels : ['ステータス変化なし']
}
