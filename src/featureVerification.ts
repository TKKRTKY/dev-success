import type {
  FeatureVerification,
  FeatureVerificationStatus,
} from './domain/types'

export const getFeatureVerificationStatus = (
  verifications: FeatureVerification[],
): FeatureVerificationStatus => {
  if (verifications.length === 0) return 'unchecked'
  if (verifications.some((verification) => !verification.success)) {
    return 'failed'
  }

  const verifiedTypes = new Set(
    verifications.map((verification) => verification.verificationType),
  )
  return verifiedTypes.size === 4 ? 'passed' : 'partial'
}

export const featureVerificationStatusLabel = (
  status: FeatureVerificationStatus = 'unchecked',
): string =>
  ({
    unchecked: '未確認',
    passed: '確認済み',
    failed: '失敗あり',
    partial: '一部確認済み',
  })[status]
