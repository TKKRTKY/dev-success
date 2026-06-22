import { describe, expect, it } from 'vitest'
import {
  createImplementationReview,
  evaluateImplementationReadiness,
} from './implementationReview'

describe('evaluateImplementationReadiness', () => {
  it('実行結果がなければunknownにする', () => {
    expect(createImplementationReview('seed-1').readiness).toBe('unknown')
  })

  it('typecheck成功とdiffがあればreadyにする', () => {
    const result = evaluateImplementationReadiness({
      ...createImplementationReview('seed-1'),
      agentRun: {
        agentKind: 'codex',
        success: true,
        exitCode: 0,
        stdout: 'done',
        stderr: '',
        durationMs: 10,
      },
      repositoryDiff: {
        changedFiles: ['src/App.tsx'],
        nameOnlyText: 'src/App.tsx',
        statText: '1 file changed',
        insertions: 3,
        deletions: 1,
        fileCount: 1,
        riskLevel: 'low',
      },
      verifications: [
        {
          verificationType: 'typecheck',
          command: 'npm run typecheck',
          success: true,
          checkedAt: new Date(0).toISOString(),
          summaryText: 'success',
        },
      ],
    })
    expect(result.readiness).toBe('ready')
  })

  it('実行不能は確認結果と混ぜずconcernに残す', () => {
    const result = evaluateImplementationReadiness({
      ...createImplementationReview('seed-1'),
      operationErrors: ['[verification:test] repositoryPath未設定'],
    })
    expect(result.verifications).toHaveLength(0)
    expect(result.concerns).toContain(
      '[verification:test] repositoryPath未設定',
    )
  })
})
