import { describe, expect, it } from 'vitest'
import { getGitDiffRiskLevel, parseGitDiffInput } from './gitDiffParser'

describe('gitDiffParser', () => {
  it('statからファイル数と行数を読む', () => {
    const result = parseGitDiffInput(
      'src/App.tsx | 12 ++++++------\n1 file changed, 6 insertions(+), 6 deletions(-)',
    )
    expect(result).toMatchObject({
      changedFiles: ['src/App.tsx'],
      fileCount: 1,
      insertions: 6,
      deletions: 6,
      riskLevel: 'low',
    })
  })

  it('300行以上の追加でリスクを一段階上げる', () => {
    expect(getGitDiffRiskLevel(2, 300, 0)).toBe('medium')
  })
})
