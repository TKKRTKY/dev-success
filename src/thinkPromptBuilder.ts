import type {
  FeatureSeed,
  ProjectConfig,
  ProjectContextSummary,
  ProjectStatus,
  ReleaseJudgement,
  RunHistoryEntry,
  ScenarioConfig,
  ScenarioStatus,
} from './domain/types'

export interface BuildThinkPromptInput {
  projectConfig: ProjectConfig
  projectStatus: ProjectStatus
  featureSeeds: FeatureSeed[]
  runHistory: RunHistoryEntry[]
  contextSummary?: ProjectContextSummary
  latestReleaseJudgement?: ReleaseJudgement
  scenarioConfig: ScenarioConfig
  scenarioStatus: ScenarioStatus
}

const formatSeedsByStatus = (
  featureSeeds: FeatureSeed[],
  status: FeatureSeed['status'],
): string => {
  const seeds = featureSeeds.filter((seed) => seed.status === status)
  return seeds.length === 0
    ? '- なし'
    : seeds
        .map(
          (seed) =>
            `- ${seed.title} / ${seed.category} / ${seed.difficulty}: ${seed.description}`,
        )
        .join('\n')
}

const formatHistory = (runHistory: RunHistoryEntry[]): string =>
  runHistory.length === 0
    ? '- 実行履歴はまだありません'
    : runHistory
        .slice(0, 5)
        .map(
          (entry) =>
            `- TURN ${entry.turn}: ${entry.result.title} — ${entry.result.summary}`,
        )
        .join('\n')

export const buildThinkPrompt = ({
  projectConfig,
  projectStatus,
  featureSeeds,
  runHistory,
  contextSummary,
  latestReleaseJudgement,
  scenarioConfig,
  scenarioStatus,
}: BuildThinkPromptInput): string => {
  const remainingTurns = Math.max(
    scenarioConfig.maxTurn - projectStatus.turn,
    0,
  )
  const plannedTitles = featureSeeds
    .filter((seed) => seed.status === 'planned')
    .map((seed) => seed.title)
  const builtTitles = featureSeeds
    .filter((seed) => seed.status === 'built')
    .map((seed) => seed.title)
  const allTitles = featureSeeds.map((seed) => seed.title)
  const styleGuidance = {
    safe:
      'small、test、refactor、documentation、または変更範囲の小さいfeatureを優先する。',
    fast:
      'feature、ui、完成度を上げやすく初期ゴールへ最短で近づく候補を優先する。',
    experimental:
      'feature、developer-experience、medium/large、新しい価値を試せる候補を優先する。',
    'quality-focused':
      'test、refactor、documentation、developer-experienceを優先する。',
  }[projectConfig.developmentStyle]
  const isEarlyTurn = projectStatus.turn <= 3
  const isFinalPhase = remainingTurns <= 3

  return `あなたは、限られた開発ターンの中でプロジェクトを育てるための、次の機能候補を提案するAIです。
実装は行わず、現在状態に合う選択肢をちょうど3件だけ考えてください。

# ProjectConfig
- アプリ名: ${projectConfig.appName}
- プロダクトビジョン: ${projectConfig.productVision || '未設定'}
- 対象ユーザー: ${projectConfig.targetUser || '未設定'}
- 解決したい課題: ${projectConfig.problemStatement || '未設定'}
- 初期ゴール: ${projectConfig.initialGoal || '未設定'}
- 技術スタック: ${projectConfig.techStack}
- 開発スタイル: ${projectConfig.developmentStyle}
- verificationCommands:
  - test: ${projectConfig.verificationCommands.test || '未設定'}
  - lint: ${projectConfig.verificationCommands.lint || '未設定'}
  - typecheck: ${projectConfig.verificationCommands.typecheck || '未設定'}
  - build: ${projectConfig.verificationCommands.build || '未設定'}

# ScenarioConfig
- シナリオ状態: ${scenarioStatus}
- 最大ターン: ${scenarioConfig.maxTurn}
- シナリオ目標: ${scenarioConfig.goal}
- 現在ターン: ${projectStatus.turn}
- 残りターン: ${remainingTurns}

# ProjectStatus
- 完成度: ${projectStatus.completion}
- 体力: ${projectStatus.stamina}
- やる気: ${projectStatus.motivation}
- 技術的負債: ${projectStatus.technicalDebt}

# FeatureSeed
## planned
${formatSeedsByStatus(featureSeeds, 'planned')}
## building
${formatSeedsByStatus(featureSeeds, 'building')}
## built
${formatSeedsByStatus(featureSeeds, 'built')}
## discarded
${formatSeedsByStatus(featureSeeds, 'discarded')}
## 既存title一覧
${allTitles.length > 0 ? allTitles.map((title) => `- ${title}`).join('\n') : '- なし'}

# RunHistory（直近）
${formatHistory(runHistory)}

# ContextSummary
- summary: ${contextSummary?.summary || 'まだありません'}
- recentProgress: ${contextSummary?.recentProgress.join(' / ') || 'なし'}
- openConcerns: ${contextSummary?.openConcerns.join(' / ') || 'なし'}
- suggestedFocus: ${contextSummary?.suggestedFocus.join(' / ') || 'なし'}
- nextThinkHints: ${contextSummary?.nextThinkHints.join(' / ') || 'なし'}

# 最新のリリース判定
${latestReleaseJudgement ? `- ランク: ${latestReleaseJudgement.rank}
- スコア: ${latestReleaseJudgement.score}
- 懸念: ${latestReleaseJudgement.concerns.join(' / ') || 'なし'}
- 推奨: ${latestReleaseJudgement.recommendations.join(' / ') || 'なし'}` : '- まだありません'}

# 候補生成ルール
- 候補は必ず「${projectConfig.appName}」固有の内容にする
- productVision、problemStatement、initialGoalに直接関係する候補を最優先する
- title、description、expectedImpact、implementationHintに対象ユーザーや具体的な業務・データ・画面名を反映する
- 「UI改善」「テスト追加」「README更新」だけで成立する汎用候補は避ける
- technicalDebtが高い、または直近にverification failed / errorがある場合は、その具体的な失敗対象に対するtest / refactor / documentationを出してよい
- plannedのtitleと重複させない: ${plannedTitles.join(' / ') || 'なし'}
- built済み機能と完全に重複させない: ${builtTitles.join(' / ') || 'なし'}
- 同じ応答内でtitleを重複させない
- 開発スタイル「${projectConfig.developmentStyle}」の傾向: ${styleGuidance}
${isEarlyTurn ? `- 現在は初期ターンなので、initialGoalに直結するfeature / uiを優先する
- 入力、一覧、保存、基本導線などから、このプロジェクト固有の具体名を使って提案する` : ''}
${isFinalPhase ? `- 残り${remainingTurns}ターンの終盤なのでlargeは避ける
- release readinessを上げるtest、build、documentation、small refactor、最終仕上げを優先する` : ''}
- 3件の方向性や難易度を適度に分散させる
- effectsは現実的な小さい整数にする
- categoryは feature, ui, test, refactor, documentation, developer-experience のいずれか
- difficultyは small, medium, large のいずれか

# 返却形式
説明、Markdown、コードフェンスを一切付けず、次の形式のJSONだけを返してください。
{
  "options": [
    {
      "title": "string",
      "description": "string",
      "expectedImpact": "string",
      "implementationHint": "string",
      "risk": "string",
      "category": "feature | ui | test | refactor | documentation | developer-experience",
      "difficulty": "small | medium | large",
      "effects": {
        "completion": 0,
        "technicalDebt": 0,
        "stamina": 0,
        "motivation": 0
      }
    }
  ]
}
optionsは必ず3件にしてください。`
}
