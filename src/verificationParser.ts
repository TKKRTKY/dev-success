import { getActualStatusChanges } from './domain/status'
import type {
  ParsedVerificationResult,
  ProjectStatus,
  RunResult,
  StatusChanges,
  VerificationRiskLevel,
  VerificationType,
} from './domain/types'

export interface ParseVerificationResultInput {
  verificationType: VerificationType
  command: string
  output: string
  successOverride?: boolean
}

export interface CreateVerificationRunResultInput
  extends ParseVerificationResultInput {
  projectStatus: ProjectStatus
}

const successPattern =
  /success|successful|passed|passing|done|no errors|0 errors|\bOK\b|成功|通過/i
const failurePattern =
  /failed|failing|exception|cannot|timeout|exited with code 1|失敗|エラー/i
const errorWordPattern = /\berrors?\b/i
const warningWordPattern = /\bwarnings?\b|警告/i

const getReportedCount = (
  output: string,
  pattern: RegExp,
): number | null => {
  const matches = Array.from(output.matchAll(pattern))
  if (matches.length === 0) return null
  return Math.max(...matches.map((match) => Number(match[1])))
}

const countMatchingLines = (logs: string[], pattern: RegExp): number =>
  logs.filter((line) => pattern.test(line)).length

const getRiskLevel = (
  success: boolean,
  errorCount: number,
  output: string,
): VerificationRiskLevel => {
  if (/timeout|exited with code 1/i.test(output)) return 'high'
  if (success) return 'low'
  return errorCount >= 4 ? 'high' : 'medium'
}

export const parseVerificationResult = ({
  verificationType,
  command,
  output,
  successOverride,
}: ParseVerificationResultInput): ParsedVerificationResult | null => {
  const trimmedOutput = output.trim()
  if (!trimmedOutput) return null

  const logs = trimmedOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const outputWithoutZeroErrors = trimmedOutput.replace(
    /\b(?:no|0)\s+errors?\b/gi,
    '',
  )
  const hasFailure =
    failurePattern.test(trimmedOutput) ||
    errorWordPattern.test(outputWithoutZeroErrors)
  const success =
    successOverride ?? (!hasFailure && successPattern.test(trimmedOutput))
  const reportedErrors = getReportedCount(
    trimmedOutput,
    /\b(\d+)\s+errors?\b/gi,
  )
  const reportedFailures = getReportedCount(
    trimmedOutput,
    /\b(\d+)\s+(?:failed|failing|failures?)\b/gi,
  )
  const reportedWarnings = getReportedCount(
    trimmedOutput,
    /\b(\d+)\s+warnings?\b/gi,
  )
  const errorCount =
    reportedErrors ??
    reportedFailures ??
    countMatchingLines(
      logs.filter((line) => !/\b(?:no|0)\s+errors?\b/i.test(line)),
      /failed|failing|error|exception|cannot|timeout|exited with code 1|失敗|エラー/i,
    )
  const warningCount =
    reportedWarnings ?? countMatchingLines(logs, warningWordPattern)
  const riskLevel = getRiskLevel(success, errorCount, trimmedOutput)
  const resultLabel = success ? '成功' : '失敗'

  return {
    verificationType,
    command: command.trim() || `${verificationType} command`,
    success,
    summaryText: `${verificationType} ${resultLabel} / errors ${errorCount} / warnings ${warningCount} / リスク ${riskLevel}`,
    errorCount,
    warningCount,
    riskLevel,
    logs,
  }
}

export const getVerificationStatusChanges = (
  parsed: ParsedVerificationResult,
): StatusChanges => {
  const changes: StatusChanges = parsed.success
    ? { completion: 3, technicalDebt: -5, motivation: 1 }
    : { technicalDebt: 8, motivation: -1 }

  if (parsed.warningCount > 0) {
    changes.technicalDebt = (changes.technicalDebt ?? 0) + 2
  }
  if (parsed.success && parsed.verificationType === 'build') {
    changes.completion = (changes.completion ?? 0) + 3
  }
  if (parsed.success && parsed.verificationType === 'test') {
    changes.completion = (changes.completion ?? 0) + 2
    changes.technicalDebt = (changes.technicalDebt ?? 0) - 2
  }

  return changes
}

export const createVerificationRunResult = ({
  projectStatus,
  ...input
}: CreateVerificationRunResultInput): RunResult | null => {
  const parsed = parseVerificationResult(input)
  if (!parsed) return null

  return createVerificationRunResultFromParsed(parsed, projectStatus)
}

export const createVerificationRunResultFromParsed = (
  parsed: ParsedVerificationResult,
  projectStatus: ProjectStatus,
): RunResult => {
  return {
    id: crypto.randomUUID(),
    turn: projectStatus.turn + 1,
    commandType: 'check',
    title: `${parsed.verificationType} の確認結果`,
    summary: parsed.summaryText,
    statusChanges: getActualStatusChanges(
      projectStatus,
      getVerificationStatusChanges(parsed),
    ),
    changedFiles: [],
    logs: parsed.logs,
    recommendation: parsed.success
      ? '確認は成功しました。次の実装へ進むか、差分を整理しましょう。'
      : '失敗内容を確認し、原因を小さく切り分けて修正しましょう。',
    createdAt: new Date().toISOString(),
    verification: parsed,
  }
}
