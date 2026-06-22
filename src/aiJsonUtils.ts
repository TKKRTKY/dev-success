import type {
  FeatureSeed,
  FeatureSeedOption,
  IdeaGenerationSource,
} from './domain/types'

export interface ThinkRepairContext {
  plannedFeatureSeeds: Array<Pick<FeatureSeed, 'title'> | string>
  fallbackOptions: FeatureSeedOption[]
}

export interface ThinkRepairResult {
  options: FeatureSeedOption[]
  source: IdeaGenerationSource
  warnings: string[]
}

export interface NormalizeFeatureSeedOptionContext {
  index?: number
  fallback?: FeatureSeedOption
  warnings?: string[]
}

interface SafeJsonParseDetail {
  value: unknown
  extracted: boolean
  repaired: boolean
}

const categories = new Set<FeatureSeedOption['category']>([
  'feature',
  'ui',
  'test',
  'refactor',
  'documentation',
  'developer-experience',
])
const difficulties = new Set<FeatureSeedOption['difficulty']>([
  'small',
  'medium',
  'large',
])
const defaultEffects = {
  completion: 3,
  technicalDebt: 0,
  stamina: -5,
  motivation: 0,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeTitle = (title: string): string =>
  title.trim().toLocaleLowerCase()

const createId = (index: number): string =>
  `idea-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`

const jsonCandidates = (rawOutput: string): string[] => {
  const fenced = Array.from(
    rawOutput.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
    (match) => match[1].trim(),
  )
  return [...fenced, rawOutput.trim()].filter(Boolean)
}

/**
 * Extracts the widest JSON object from a code fence or mixed prose.
 * A balanced-object scan is used as a fallback when trailing prose contains
 * braces that would make the first-to-last substring invalid.
 */
export const extractJsonObject = (rawOutput: string): string | null => {
  for (const candidate of jsonCandidates(rawOutput)) {
    const first = candidate.indexOf('{')
    const last = candidate.lastIndexOf('}')
    if (first >= 0 && last > first) {
      const widest = candidate.slice(first, last + 1)
      try {
        JSON.parse(widest)
        return widest
      } catch {
        // Continue with the balanced scan below.
      }
    }

    let start = -1
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = 0; index < candidate.length; index += 1) {
      const character = candidate[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') {
        inString = true
      } else if (character === '{') {
        if (depth === 0) start = index
        depth += 1
      } else if (character === '}' && depth > 0) {
        depth -= 1
        if (depth === 0 && start >= 0) {
          return candidate.slice(start, index + 1)
        }
      }
    }
  }
  return null
}

const repairJsonText = (input: string): string =>
  input
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(
      /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
      (_match, value: string) =>
        `"${value.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`,
    )

const parseJsonDetail = (rawOutput: string): SafeJsonParseDetail | null => {
  const extracted = extractJsonObject(rawOutput)
  const raw = rawOutput.trim()
  const candidates = [
    { text: raw, extracted: false, repaired: false },
    extracted
      ? { text: extracted, extracted: extracted !== raw, repaired: false }
      : null,
    { text: repairJsonText(raw), extracted: false, repaired: true },
    extracted
      ? {
          text: repairJsonText(extracted),
          extracted: extracted !== raw,
          repaired: true,
        }
      : null,
  ].filter(
    (
      candidate,
    ): candidate is {
      text: string
      extracted: boolean
      repaired: boolean
    } => Boolean(candidate?.text),
  )

  const attempted = new Set<string>()
  for (const candidate of candidates) {
    if (attempted.has(candidate.text)) continue
    attempted.add(candidate.text)
    try {
      return {
        value: JSON.parse(candidate.text),
        extracted: candidate.extracted,
        repaired: candidate.repaired,
      }
    } catch {
      // Try the next conservative repair candidate.
    }
  }
  return null
}

export const safeParseJson = (rawOutput: string): unknown | null =>
  parseJsonDetail(rawOutput)?.value ?? null

const fallbackText = (
  fallback: FeatureSeedOption | undefined,
  key: 'description' | 'expectedImpact' | 'implementationHint' | 'risk',
  safeValue: string,
): string => fallback?.[key]?.trim() || safeValue

export const normalizeFeatureSeedOption = (
  input: unknown,
  context: NormalizeFeatureSeedOptionContext = {},
): FeatureSeedOption | null => {
  if (!isRecord(input)) return null

  const index = context.index ?? 0
  const label = `候補${index + 1}`
  const warnings = context.warnings
  const fallback = context.fallback
  const title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : ''
  if (!title) {
    warnings?.push(`${label}はtitleが空のため除外しました。`)
    return null
  }

  const textDefaults = {
    description: '現在の課題を小さな変更で改善します。',
    expectedImpact: 'プロジェクト固有の価値を安全に前進させます。',
    implementationHint: '既存構成を確認し、小さな差分で実装します。',
    risk: '確認コマンドで変更の影響を確認します。',
  }
  const texts = {} as Record<keyof typeof textDefaults, string>
  for (const key of Object.keys(textDefaults) as Array<
    keyof typeof textDefaults
  >) {
    const current =
      typeof input[key] === 'string' ? input[key].trim() : ''
    texts[key] = current || fallbackText(fallback, key, textDefaults[key])
    if (!current) warnings?.push(`${label}の${key}を補完しました。`)
  }

  const rawCategory =
    typeof input.category === 'string'
      ? input.category.trim().toLowerCase()
      : ''
  const categoryAliases: Record<string, FeatureSeedOption['category']> = {
    features: 'feature',
    ux: 'ui',
    frontend: 'ui',
    tests: 'test',
    testing: 'test',
    docs: 'documentation',
    document: 'documentation',
    dx: 'developer-experience',
    developer_experience: 'developer-experience',
  }
  const aliasedCategory = categoryAliases[rawCategory] ?? rawCategory
  const category = categories.has(
    aliasedCategory as FeatureSeedOption['category'],
  )
    ? (aliasedCategory as FeatureSeedOption['category'])
    : fallback?.category ?? 'feature'
  if (category !== rawCategory) {
    warnings?.push(`${label}のcategoryを${category}に正規化しました。`)
  }

  const rawDifficulty =
    typeof input.difficulty === 'string'
      ? input.difficulty.trim().toLowerCase()
      : ''
  const difficultyAliases: Record<string, FeatureSeedOption['difficulty']> = {
    easy: 'small',
    low: 'small',
    中: 'medium',
    normal: 'medium',
    hard: 'large',
    high: 'large',
  }
  const aliasedDifficulty =
    difficultyAliases[rawDifficulty] ?? rawDifficulty
  const difficulty = difficulties.has(
    aliasedDifficulty as FeatureSeedOption['difficulty'],
  )
    ? (aliasedDifficulty as FeatureSeedOption['difficulty'])
    : fallback?.difficulty ?? 'medium'
  if (difficulty !== rawDifficulty) {
    warnings?.push(`${label}のdifficultyを${difficulty}に正規化しました。`)
  }

  const effectsInput = isRecord(input.effects) ? input.effects : {}
  const effects = { ...defaultEffects }
  for (const key of Object.keys(defaultEffects) as Array<
    keyof typeof defaultEffects
  >) {
    const value = effectsInput[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      effects[key] = value
    } else if (
      typeof value === 'string' &&
      value.trim() &&
      Number.isFinite(Number(value))
    ) {
      effects[key] = Number(value)
      warnings?.push(`${label}のeffects.${key}を数値へ変換しました。`)
    } else {
      effects[key] =
        typeof fallback?.effects[key] === 'number'
          ? fallback.effects[key] ?? defaultEffects[key]
          : defaultEffects[key]
      warnings?.push(`${label}のeffects.${key}を補完しました。`)
    }
  }

  return {
    id: createId(index),
    title,
    ...texts,
    category,
    difficulty,
    effects,
  }
}

const cloneFallback = (
  option: FeatureSeedOption,
  index: number,
): FeatureSeedOption => ({
  ...option,
  id: createId(index),
  effects: { ...option.effects },
})

const fillFallbackOptions = (
  currentOptions: FeatureSeedOption[],
  fallbackOptions: FeatureSeedOption[],
  excludedTitles: Set<string>,
  warnings: string[],
): FeatureSeedOption[] => {
  const options = [...currentOptions]
  const usedTitles = new Set([
    ...excludedTitles,
    ...options.map((option) => normalizeTitle(option.title)),
  ])
  for (const fallback of fallbackOptions) {
    if (options.length >= 3) break
    const title = normalizeTitle(fallback.title)
    if (!title || usedTitles.has(title)) continue
    usedTitles.add(title)
    options.push(cloneFallback(fallback, options.length))
    warnings.push(`不足分をローカル候補「${fallback.title}」で補完しました。`)
  }
  let safeIndex = 1
  while (options.length < 3) {
    const title = `小さな改善を行う ${safeIndex}`
    safeIndex += 1
    if (usedTitles.has(normalizeTitle(title))) continue
    usedTitles.add(normalizeTitle(title))
    options.push({
      id: createId(options.length),
      title,
      description: '現在の課題を小さな変更で改善します。',
      expectedImpact: 'プロジェクトを安全に前進させます。',
      implementationHint: '既存構成を確認し、小さな差分で実装します。',
      risk: '確認コマンドを実行して影響を確認します。',
      category: 'feature',
      difficulty: 'medium',
      effects: { ...defaultEffects },
    })
    warnings.push(`不足分を安全な標準候補「${title}」で補完しました。`)
  }
  return options.slice(0, 3)
}

export const repairThinkAgentOptions = (
  rawOutput: string,
  context: ThinkRepairContext,
): ThinkRepairResult => {
  const warnings: string[] = []
  const excludedTitles = new Set(
    context.plannedFeatureSeeds.map((seed) =>
      normalizeTitle(typeof seed === 'string' ? seed : seed.title),
    ),
  )
  const parseDetail = parseJsonDetail(rawOutput)
  const parsed = parseDetail?.value
  if (!isRecord(parsed) || !Array.isArray(parsed.options)) {
    warnings.push(
      'options配列を復元できなかったため、ローカル候補を使用しました。',
    )
    return {
      options: fillFallbackOptions(
        [],
        context.fallbackOptions,
        excludedTitles,
        warnings,
      ),
      source: 'fallback',
      warnings,
    }
  }

  if (parsed.options.length > 3) {
    warnings.push(`${parsed.options.length}件の候補を先頭3件に絞りました。`)
  }
  if (parseDetail?.extracted) {
    warnings.push('説明文またはコードブロックからJSONを抽出しました。')
  }
  if (parseDetail?.repaired) {
    warnings.push('JSONの軽微な構文崩れを修復しました。')
  }

  const usedTitles = new Set(excludedTitles)
  const validOptions: FeatureSeedOption[] = []
  parsed.options.slice(0, 3).forEach((input, index) => {
    const option = normalizeFeatureSeedOption(input, {
      index,
      fallback: context.fallbackOptions[index],
      warnings,
    })
    if (!option) return
    const title = normalizeTitle(option.title)
    if (usedTitles.has(title)) {
      warnings.push(`重複する「${option.title}」を除外しました。`)
      return
    }
    usedTitles.add(title)
    validOptions.push(option)
  })

  const aiCount = validOptions.length
  const options = fillFallbackOptions(
    validOptions,
    context.fallbackOptions,
    excludedTitles,
    warnings,
  )
  const usedFallback = options.length > aiCount
  return {
    options,
    source:
      aiCount === 0
        ? 'fallback'
        : usedFallback
          ? 'mixed'
          : warnings.length > 0
            ? 'repaired'
            : 'ai',
    warnings,
  }
}
