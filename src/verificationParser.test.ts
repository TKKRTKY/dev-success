import { describe, expect, it } from 'vitest'
import { parseVerificationResult } from './verificationParser'

describe('parseVerificationResult', () => {
  it('失敗語を成功語より優先する', () => {
    const result = parseVerificationResult({
      verificationType: 'test',
      command: 'npm test',
      output: '10 passed\n1 failed\nerror in suite',
    })
    expect(result?.success).toBe(false)
    expect(result?.riskLevel).toBe('medium')
  })

  it('0 errorsを失敗扱いしない', () => {
    const result = parseVerificationResult({
      verificationType: 'typecheck',
      command: 'npm run typecheck',
      output: 'success\n0 errors',
    })
    expect(result?.success).toBe(true)
    expect(result?.errorCount).toBe(0)
  })
})
