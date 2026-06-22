import type {
  FeatureSeedCategory,
  FeatureSeedDifficulty,
  FeatureSeedOption,
  FeatureSeed,
  Motivation,
  ProjectConfig,
  ProjectContextSummary,
  ProjectStatus,
  RunHistoryEntry,
  ScenarioConfig,
} from './domain/types'

interface FeatureSeedTemplate
  extends Omit<FeatureSeedOption, 'id' | 'effects'> {
  effects: FeatureSeedOption['effects']
  projectSpecific?: boolean
}

export interface GenerateFeatureSeedOptionsInput {
  projectStatus: ProjectStatus
  projectConfig: ProjectConfig
  runHistory: RunHistoryEntry[]
  featureSeeds: FeatureSeed[]
  contextSummary?: ProjectContextSummary
  scenarioConfig?: ScenarioConfig
}

const templates: FeatureSeedTemplate[] = [
  {
    title: '主要画面の最小フローを追加',
    description: '利用者が最初の価値を体験できる、入口から完了までの小さな導線を作る。',
    expectedImpact: 'アプリの完成像が見え、完成度を大きく前進させられる。',
    implementationHint: '既存コンポーネントを再利用し、1画面または1フローに絞る。',
    risk: '機能範囲を広げすぎると実装量が膨らむ。',
    category: 'feature',
    difficulty: 'medium',
    effects: { completion: 12, stamina: -16, technicalDebt: 4 },
  },
  {
    title: '空状態と初回体験を整える',
    description: 'データがない状態でも次の操作が迷わず分かるUIを追加する。',
    expectedImpact: '初見での分かりやすさと画面の完成感が上がる。',
    implementationHint: '空状態メッセージ、行動ボタン、補足説明を小さく追加する。',
    risk: '既存の情報量と競合すると画面が散らかる。',
    category: 'ui',
    difficulty: 'small',
    effects: { completion: 7, stamina: -8, technicalDebt: 1, motivation: 1 },
  },
  {
    title: '主要ロジックのテストを追加',
    description: '状態更新や解析処理など、壊れると影響が大きい箇所をテストで固定する。',
    expectedImpact: '変更への安心感が増え、技術的負債を減らせる。',
    implementationHint: '副作用の少ない関数から、成功・境界・失敗ケースを追加する。',
    risk: 'UI詳細に寄りすぎたテストは保守コストが高くなる。',
    category: 'test',
    difficulty: 'medium',
    effects: { completion: 5, stamina: -11, technicalDebt: -8 },
  },
  {
    title: '巨大な責務を小さなモジュールへ分離',
    description: '状態更新、API通信、表示ロジックのうち混み合った責務を切り出す。',
    expectedImpact: '今後の機能追加が安全になり、読みやすさが改善する。',
    implementationHint: 'まず純粋関数かカスタムフックを1つだけ抽出する。',
    risk: '一度に広く移動すると差分が追いにくくなる。',
    category: 'refactor',
    difficulty: 'medium',
    effects: { completion: 3, stamina: -12, technicalDebt: -10 },
  },
  {
    title: 'READMEに現在の使い方を反映',
    description: '起動方法、主要機能、制約、次の開発方針を短く整理する。',
    expectedImpact: '作業再開と他者への共有が楽になる。',
    implementationHint: '現状と一致する情報だけを、見出し単位で追記する。',
    risk: '将来構想を書きすぎると実装との差が広がる。',
    category: 'documentation',
    difficulty: 'small',
    effects: { completion: 2, stamina: -4, technicalDebt: -5, motivation: 1 },
  },
  {
    title: '開発時のエラー表示を改善',
    description: 'API失敗や入力不足を、原因と次の行動が分かる形で表示する。',
    expectedImpact: '調査時間が減り、開発体験と復旧しやすさが上がる。',
    implementationHint: '共通のエラー表示と、再試行できる導線を追加する。',
    risk: 'エラー種別を細分化しすぎると実装が複雑になる。',
    category: 'developer-experience',
    difficulty: 'small',
    effects: { completion: 4, stamina: -7, technicalDebt: -4, motivation: 1 },
  },
  {
    title: '一覧の検索と絞り込みを追加',
    description: '増えた履歴や項目を素早く探せる、最小限の検索UIを追加する。',
    expectedImpact: '情報量が増えても目的の結果へ辿り着きやすくなる。',
    implementationHint: 'クライアント側の文字列フィルタから始める。',
    risk: '検索対象と一致条件が曖昧だと期待とずれる。',
    category: 'feature',
    difficulty: 'medium',
    effects: { completion: 9, stamina: -13, technicalDebt: 3 },
  },
  {
    title: 'ステータス表示の視認性を上げる',
    description: '重要な変化や現在の行動対象を、ひと目で比較できるようにする。',
    expectedImpact: 'ゲームループと次の判断が分かりやすくなる。',
    implementationHint: '色だけに頼らず、ラベルと差分表記を整理する。',
    risk: '装飾を増やしすぎると主操作が埋もれる。',
    category: 'ui',
    difficulty: 'small',
    effects: { completion: 6, stamina: -7, technicalDebt: 0, motivation: 1 },
  },
  {
    title: '失敗ケースの回帰テストを追加',
    description: '直近で失敗した処理を再現し、同じ問題が戻らないようにする。',
    expectedImpact: '既知の失敗を固定し、次の修正を安全に進められる。',
    implementationHint: '直近ログから入力と期待結果を1ケースに落とし込む。',
    risk: '原因が未整理のままでは誤った仕様を固定する可能性がある。',
    category: 'test',
    difficulty: 'small',
    effects: { completion: 4, stamina: -7, technicalDebt: -7 },
  },
  {
    title: '設定と実行状態の境界を整理',
    description: '保存設定、一時入力、実行結果の責務を明確に分ける。',
    expectedImpact: '状態同期の不具合を減らし、拡張しやすくなる。',
    implementationHint: '型と保存境界を先に決め、1種類の状態から移す。',
    risk: '既存localStorageとの互換処理を忘れると復元が壊れる。',
    category: 'refactor',
    difficulty: 'large',
    effects: { completion: 5, stamina: -20, technicalDebt: -14 },
  },
  {
    title: '次回作業メモを自動でまとめる',
    description: '直近履歴と未完了事項から、再開時に読む短いメモを表示する。',
    expectedImpact: '中断後の文脈復帰が速くなり、やる気を保ちやすい。',
    implementationHint: '履歴3件と現在状態をテンプレートへ整形する。',
    risk: '情報を詰め込みすぎると読むコストが増える。',
    category: 'developer-experience',
    difficulty: 'medium',
    effects: { completion: 5, stamina: -9, technicalDebt: -3, motivation: 1 },
  },
  {
    title: '設計判断を短いドキュメントに残す',
    description: '現在の構成を選んだ理由と、守る境界を簡潔に記録する。',
    expectedImpact: '将来の変更で迷いにくくなり、不要な作り直しを防げる。',
    implementationHint: '背景、決定、結果の3項目だけでまとめる。',
    risk: '実装と同期されない文書は逆に混乱を生む。',
    category: 'documentation',
    difficulty: 'small',
    effects: { completion: 2, stamina: -4, technicalDebt: -6, motivation: 1 },
  },
]

const motivationRank: Record<Motivation, number> = {
  絶不調: 0,
  不調: 1,
  普通: 2,
  好調: 3,
  絶好調: 4,
}

const hasRecentFailure = (history: RunHistoryEntry[]): boolean =>
  history.slice(0, 3).some(({ result }) =>
    /失敗|failed|error|exception|timeout/i.test(
      `${result.title} ${result.summary} ${result.logs.join(' ')}`,
    ),
  )

const getWeight = (
  template: FeatureSeedTemplate,
  input: GenerateFeatureSeedOptionsInput,
): number => {
  const {
    projectStatus,
    projectConfig,
    runHistory,
    featureSeeds,
    contextSummary,
  } = input
  let weight = 10

  if (
    projectStatus.completion < 45 &&
    ['feature', 'ui'].includes(template.category)
  ) {
    weight += 14
  }
  if (
    projectStatus.turn <= 3 &&
    ['feature', 'ui'].includes(template.category)
  ) {
    weight += template.projectSpecific ? 28 : 10
  }
  if (
    projectStatus.technicalDebt >= 20 &&
    ['test', 'refactor', 'documentation'].includes(template.category)
  ) {
    weight += 18
  }
  if (projectStatus.stamina <= 35 && template.difficulty === 'small') {
    weight += 20
  }
  if (
    motivationRank[projectStatus.motivation] <= 1 &&
    ['documentation', 'developer-experience'].includes(template.category)
  ) {
    weight += 18
  }
  if (
    hasRecentFailure(runHistory) &&
    ['test', 'refactor'].includes(template.category)
  ) {
    weight += 20
  }
  if (
    !projectConfig.repositoryPath &&
    ['documentation', 'developer-experience'].includes(template.category)
  ) {
    weight += 6
  }
  if (
    /react|next|vue|svelte|frontend/i.test(projectConfig.techStack) &&
    template.category === 'ui'
  ) {
    weight += 5
  }
  switch (projectConfig.developmentStyle) {
    case 'safe':
      if (
        template.difficulty === 'small' ||
        ['test', 'documentation', 'refactor'].includes(template.category)
      ) {
        weight += 12
      }
      break
    case 'fast':
      if (['feature', 'ui'].includes(template.category)) weight += 15
      break
    case 'experimental':
      if (
        ['medium', 'large'].includes(template.difficulty) ||
        ['feature', 'developer-experience'].includes(template.category)
      ) {
        weight += 14
      }
      break
    case 'quality-focused':
      if (
        ['test', 'refactor', 'documentation', 'developer-experience'].includes(
          template.category,
        )
      ) {
        weight += 16
      }
      break
  }
  const remainingTurns = input.scenarioConfig
    ? input.scenarioConfig.maxTurn - projectStatus.turn
    : Number.POSITIVE_INFINITY
  if (remainingTurns <= 3) {
    if (template.difficulty === 'large') weight -= 20
    if (
      template.difficulty === 'small' ||
      ['test', 'documentation', 'refactor'].includes(template.category)
    ) {
      weight += 20
    }
  }
  if (contextSummary?.suggestedFocus.includes(template.category)) {
    weight += 22
  }
  const hints = contextSummary?.nextThinkHints.join(' ') ?? ''
  if (/テスト|確認/.test(hints) && template.category === 'test') {
    weight += 8
  }
  if (/リファクタ|負債/.test(hints) && template.category === 'refactor') {
    weight += 8
  }
  if (
    /UI|機能|価値/.test(hints) &&
    ['ui', 'feature'].includes(template.category)
  ) {
    weight += 6
  }

  const recentCategories = featureSeeds
    .slice(0, 3)
    .map((seed) => seed.category)
  if (recentCategories.includes(template.category)) weight -= 4

  return Math.max(1, weight)
}

const weightedPick = (
  pool: FeatureSeedTemplate[],
  input: GenerateFeatureSeedOptionsInput,
): FeatureSeedTemplate => {
  const weighted = pool.map((template) => ({
    template,
    weight: getWeight(template, input),
  }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let cursor = Math.random() * total

  for (const item of weighted) {
    cursor -= item.weight
    if (cursor <= 0) return item.template
  }
  return weighted[weighted.length - 1].template
}

const shorten = (value: string, length = 30): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > length
    ? `${normalized.slice(0, length - 1)}…`
    : normalized
}

const createProjectSpecificTemplates = (
  input: GenerateFeatureSeedOptionsInput,
): FeatureSeedTemplate[] => {
  const { projectConfig } = input
  const goal =
    projectConfig.initialGoal.trim() ||
    projectConfig.productVision.trim() ||
    `${projectConfig.appName}の中核体験を作る`
  const focus = shorten(goal)
  const target = projectConfig.targetUser.trim() || '対象ユーザー'
  const problem =
    projectConfig.problemStatement.trim() || '現在の主要な課題'
  const stack = projectConfig.techStack.trim() || '既存技術スタック'

  return [
    {
      title: `「${focus}」の最小入力導線を作る`,
      description: `${target}が「${goal}」に必要な情報を迷わず入力できる最小フォームと基本操作を作る。`,
      expectedImpact: `最初の操作から「${projectConfig.productVision || goal}」の価値を体験でき、「${problem}」の解決を前進させる。`,
      implementationHint: `${stack}の既存構成を使い、入力・検証・完了表示までを1つの小さな導線に絞る。`,
      risk: '入力項目を増やしすぎると初期ゴールを超えて実装範囲が広がる。',
      category: 'feature',
      difficulty: 'small',
      effects: { completion: 9, stamina: -10, technicalDebt: 2 },
      projectSpecific: true,
    },
    {
      title: `「${focus}」のデータを保存・復元する`,
      description: `${target}が入力した内容を保存し、再読み込み後も「${goal}」の作業を続けられるようにする。`,
      expectedImpact: `一度入力した情報が失われず、「${problem}」を継続的に改善できるMVPの土台になる。`,
      implementationHint: `${stack}に合う既存の状態管理と保存方式を使い、1種類のデータだけで保存・復元を完成させる。`,
      risk: '保存データの互換性や空データ時の扱いを決めないと復元時に壊れる。',
      category: 'feature',
      difficulty: 'medium',
      effects: { completion: 11, stamina: -14, technicalDebt: 3 },
      projectSpecific: true,
    },
    {
      title: `「${focus}」の結果を一覧で確認する`,
      description: `${target}が保存済みの内容と現在の状態を比較し、次の操作を判断できる一覧画面を作る。`,
      expectedImpact: `「${problem}」の状況が見えるようになり、初期ゴールの基本導線が一周する。`,
      implementationHint: `${stack}の既存UIを再利用し、主要情報・空状態・次の行動だけを表示する。`,
      risk: '表示項目を増やしすぎると、重要な状態と操作が埋もれる。',
      category: 'ui',
      difficulty: 'small',
      effects: { completion: 8, stamina: -9, technicalDebt: 1, motivation: 1 },
      projectSpecific: true,
    },
    {
      title: `「${focus}」の成功条件をテストで固定する`,
      description: `初期ゴール「${goal}」の主要な成功条件と、「${problem}」が再発しないための確認ケースを追加する。`,
      expectedImpact: '中核機能を壊さず改善でき、リリース判定の信頼性が上がる。',
      implementationHint: `${projectConfig.verificationCommands.test || '設定済みテストコマンド'}で確認できる純粋ロジックまたは主要フローを1〜2ケースに絞る。`,
      risk: '仕様が曖昧なままテストすると、誤った挙動を固定する可能性がある。',
      category: 'test',
      difficulty: 'small',
      effects: { completion: 4, stamina: -7, technicalDebt: -6 },
      projectSpecific: true,
    },
    {
      title: `「${focus}」のリリース前チェックを整える`,
      description: `${goal}を公開する前に必要な確認手順と未確認事項を、現在のコマンド構成に合わせて整理する。`,
      expectedImpact: '残り作業とリスクが明確になり、最終リリース判定へ進みやすくなる。',
      implementationHint: `typecheck「${projectConfig.verificationCommands.typecheck}」、build「${projectConfig.verificationCommands.build}」を中心に最小の確認手順をまとめる。`,
      risk: '実際に確認せず手順だけを書くと、品質が上がったように見えてしまう。',
      category: 'documentation',
      difficulty: 'small',
      effects: { completion: 2, stamina: -4, technicalDebt: -4, motivation: 1 },
      projectSpecific: true,
    },
    {
      title: `「${focus}」の状態境界を整理する`,
      description: `${goal}に関わる入力・保存・表示の責務を分け、「${problem}」を生む曖昧な状態を減らす。`,
      expectedImpact: '次の機能追加や修正を小さな差分で行いやすくなる。',
      implementationHint: `${stack}内の状態型と更新関数を確認し、最も混み合った責務を1つだけ切り出す。`,
      risk: '広範囲を一度に移動すると、初期ゴールへの進捗が見えにくくなる。',
      category: 'refactor',
      difficulty: 'medium',
      effects: { completion: 3, stamina: -10, technicalDebt: -8 },
      projectSpecific: true,
    },
  ]
}

export const generateFeatureSeedOptions = (
  input: GenerateFeatureSeedOptionsInput,
): FeatureSeedOption[] => {
  const excludedTitles = new Set(
    input.featureSeeds
      .filter((seed) => seed.status === 'planned' || seed.status === 'built')
      .map((seed) => seed.title.trim().toLocaleLowerCase()),
  )
  const projectTemplates = createProjectSpecificTemplates(input)
  const pool = [...projectTemplates, ...templates].filter(
    (template) =>
      !excludedTitles.has(template.title.trim().toLocaleLowerCase()),
  )
  const selected: FeatureSeedTemplate[] = []
  const remainingTurns = input.scenarioConfig
    ? input.scenarioConfig.maxTurn - input.projectStatus.turn
    : Number.POSITIVE_INFINITY
  const specificTarget =
    input.projectStatus.turn <= 3 ? 3 : remainingTurns <= 3 ? 1 : 2
  const projectPool = pool.filter(
    (template) =>
      template.projectSpecific &&
      (input.projectStatus.turn > 3 ||
        ['feature', 'ui'].includes(template.category)),
  )

  while (
    selected.length < specificTarget &&
    projectPool.length > 0
  ) {
    const template = weightedPick(projectPool, input)
    selected.push(template)
    projectPool.splice(projectPool.indexOf(template), 1)
    pool.splice(pool.indexOf(template), 1)
  }

  while (selected.length < 3 && pool.length > 0) {
    const template = weightedPick(pool, input)
    selected.push(template)
    pool.splice(pool.indexOf(template), 1)
  }

  const { projectConfig } = input
  const goal = projectConfig.initialGoal.trim()
  const vision = projectConfig.productVision.trim()
  const targetUser = projectConfig.targetUser.trim()
  const problem = projectConfig.problemStatement.trim()
  const shortGoal = shorten(goal, 26)

  return selected.map((template) => {
    const { projectSpecific: _projectSpecific, ...option } = template
    void _projectSpecific
    return {
      ...option,
      id: crypto.randomUUID(),
      title: template.projectSpecific
        ? template.title
        : shortGoal
          ? `${template.title}：${shortGoal}`
          : template.title,
      description: template.projectSpecific
        ? template.description
        : [
            template.description,
            targetUser && `${targetUser}を主な利用者として想定する。`,
            vision && `「${vision}」というビジョンに沿って進める。`,
          ]
            .filter(Boolean)
            .join(' '),
      expectedImpact: template.projectSpecific
        ? template.expectedImpact
        : [
            template.expectedImpact,
            problem && `特に「${problem}」の改善につなげる。`,
          ]
            .filter(Boolean)
            .join(' '),
      implementationHint: template.projectSpecific
        ? template.implementationHint
        : [
            template.implementationHint,
            goal && `最初のゴール「${goal}」へ近づく最小範囲に絞る。`,
          ]
            .filter(Boolean)
            .join(' '),
    }
  })
}

export const formatFeatureSeedEffects = (
  effects: FeatureSeedOption['effects'],
): string =>
  [
    effects.completion && `完成度 ${effects.completion > 0 ? '+' : ''}${effects.completion}`,
    effects.stamina && `体力 ${effects.stamina > 0 ? '+' : ''}${effects.stamina}`,
    effects.technicalDebt &&
      `技術的負債 ${effects.technicalDebt > 0 ? '+' : ''}${effects.technicalDebt}`,
    effects.motivation &&
      `やる気 ${effects.motivation > 0 ? '+' : ''}${effects.motivation}`,
  ]
    .filter(Boolean)
    .join(' / ')

export const featureSeedCategoryLabel = (
  category: FeatureSeedCategory,
): string =>
  ({
    feature: '機能',
    ui: 'UI',
    test: 'テスト',
    refactor: 'リファクタ',
    documentation: 'ドキュメント',
    'developer-experience': '開発体験',
  })[category]

export const featureSeedDifficultyLabel = (
  difficulty: FeatureSeedDifficulty,
): string =>
  ({ small: '小', medium: '中', large: '大' })[difficulty]
