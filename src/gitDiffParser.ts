import type {
  GitDiffRiskLevel,
  GitDiffSummary,
  StatusChanges,
} from './domain/types'

const riskOrder: GitDiffRiskLevel[] = ['low', 'medium', 'high']

const raiseRisk = (
  riskLevel: GitDiffRiskLevel,
  levels = 1,
): GitDiffRiskLevel => {
  const currentIndex = riskOrder.indexOf(riskLevel)
  return riskOrder[Math.min(currentIndex + levels, riskOrder.length - 1)]
}

const getBaseRisk = (fileCount: number): GitDiffRiskLevel => {
  if (fileCount >= 9) return 'high'
  if (fileCount >= 4) return 'medium'
  return 'low'
}

export const getGitDiffRiskLevel = (
  fileCount: number,
  insertions: number,
  deletions: number,
): GitDiffRiskLevel => {
  let riskLevel = getBaseRisk(fileCount)
  if (insertions >= 300) riskLevel = raiseRisk(riskLevel)
  if (deletions >= 300) riskLevel = raiseRisk(riskLevel)
  return riskLevel
}

const isSummaryLine = (line: string): boolean =>
  /\d+\s+files?\s+changed/i.test(line)

const parseStatPath = (line: string): string | null => {
  const separatorIndex = line.indexOf('|')
  if (separatorIndex < 0) return null

  const path = line.slice(0, separatorIndex).trim()
  return path && !isSummaryLine(path) ? path : null
}

export const parseGitDiffInput = (input: string): GitDiffSummary | null => {
  const trimmedInput = input.trim()
  if (!trimmedInput) return null

  const lines = trimmedInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const summaryLine = lines.find(isSummaryLine)
  const statPaths = lines.map(parseStatPath).filter((path) => path !== null)
  const nameOnlyPaths = lines.filter(
    (line) => !line.includes('|') && !isSummaryLine(line),
  )
  const changedFiles = [...new Set([...statPaths, ...nameOnlyPaths])]

  const insertions = Number(
    summaryLine?.match(/(\d+)\s+insertions?\(\+\)/i)?.[1] ?? 0,
  )
  const deletions = Number(
    summaryLine?.match(/(\d+)\s+deletions?\(-\)/i)?.[1] ?? 0,
  )
  const reportedFileCount = Number(
    summaryLine?.match(/(\d+)\s+files?\s+changed/i)?.[1] ?? 0,
  )
  const fileCount = changedFiles.length || reportedFileCount

  const riskLevel = getGitDiffRiskLevel(fileCount, insertions, deletions)

  return {
    changedFiles,
    fileCount,
    insertions,
    deletions,
    summaryText: `${fileCount}ファイル変更 / +${insertions} / -${deletions} / リスク ${riskLevel}`,
    riskLevel,
  }
}

export const getGitDiffStatusChanges = (
  riskLevel: GitDiffRiskLevel,
): StatusChanges => {
  switch (riskLevel) {
    case 'medium':
      return { completion: 3, technicalDebt: 4 }
    case 'high':
      return { completion: 2, technicalDebt: 10, motivation: -1 }
    case 'low':
      return { completion: 2, technicalDebt: 1 }
  }
}

export const getGitDiffRecommendation = (
  riskLevel: GitDiffRiskLevel,
): string => {
  switch (riskLevel) {
    case 'medium':
      return '変更範囲を分けて確認し、「確かめる」で主要な動作を検証しましょう。'
    case 'high':
      return '差分が大きめです。変更を分割し、重点的なテストとレビューを行いましょう。'
    case 'low':
      return '差分は小さめです。「確かめる」で動作確認してから次へ進みましょう。'
  }
}
