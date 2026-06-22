import { commandDefinitions } from './domain/commands'
import { formatStatusChanges } from './domain/status'
import type {
  CommandType,
  FeatureSeed,
  ProjectConfig,
  ProjectStatus,
  RunHistoryEntry,
} from './domain/types'

export interface BuildAgentPromptInput {
  projectConfig: ProjectConfig
  projectStatus: ProjectStatus
  commandType: CommandType
  featureSeed?: FeatureSeed
  recentRunHistory: RunHistoryEntry[]
}

const commandInstructions: Record<CommandType, string[]> = {
  think: [
    '現在の状態に合う次の機能候補を3つ提案する',
    '各候補に目的、期待効果、実装ヒント、リスク、カテゴリ、難易度を含める',
    '原則としてコード変更は行わない',
  ],
  build: [
    '既存構成を確認してから小さく実装する',
    '選択された機能のもとの範囲を超える変更は避ける',
    '既存機能とlocalStorage互換性を壊さない',
    '必要に応じてテストを追加する',
    '実装後に変更ファイル、実施内容、確認結果、残課題を報告する',
  ],
  verify: [
    'test、lint、typecheck、buildなどの確認を行う',
    '失敗した場合は原因と次の修正方針をまとめる',
  ],
  check: [
    '貼り付けられた確認結果を読み、成功・失敗と原因を整理する',
    '次に必要な修正または追加確認を提案する',
  ],
  organize: [
    'README、TODO、差分、次回作業メモ、コンテキストを整理する',
    '不要な変更や曖昧な状態を減らす',
  ],
  release: [
    '完成度、技術的負債、実装済み機能、確認状態を評価する',
    'リリースを妨げる懸念と、次に必要な確認を明確にする',
  ],
}

const formatHistory = (history: RunHistoryEntry[]): string => {
  if (history.length === 0) return '- 実行履歴はまだありません'

  return history
    .slice(0, 3)
    .map((entry) => {
      const commandLabel =
        commandDefinitions[entry.result.commandType].label
      const changes = formatStatusChanges(
        entry.result.statusChanges,
        entry.motivationBefore,
      ).join('、')

      return [
        `- TURN ${entry.turn} / ${commandLabel}`,
        `  - 結果: ${entry.result.title}`,
        `  - サマリ: ${entry.result.summary}`,
        `  - ステータス変化: ${changes}`,
      ].join('\n')
    })
    .join('\n')
}

const formatFeatureSeed = (featureSeed?: FeatureSeed): string => {
  if (!featureSeed) return '現在選択されている「機能のもと」はありません。'

  return `- タイトル: ${featureSeed.title}
- 説明: ${featureSeed.description}
- 期待する効果: ${featureSeed.expectedImpact}
- 実装ヒント: ${featureSeed.implementationHint}
- リスク: ${featureSeed.risk}
- カテゴリ: ${featureSeed.category}
- 難易度: ${featureSeed.difficulty}
- 状態: ${featureSeed.status}`
}

export const buildAgentPrompt = ({
  projectConfig,
  projectStatus,
  commandType,
  featureSeed,
  recentRunHistory,
}: BuildAgentPromptInput): string => {
  const commandLabel = commandDefinitions[commandType].label
  const objective =
    commandType === 'think'
      ? '現在のプロジェクト状態から、次に育てる機能候補を3つ生成してください。'
      : commandType === 'build'
        ? featureSeed
          ? `選択済みの「${featureSeed.title}」を、小さく安全な差分で実装してください。`
          : '先に「考える」で機能のもとを選択してください。'
        : '現在の状態と直近履歴をもとに、このコマンドを実行してください。'

  return `# 役割
あなたは、既存のローカルリポジトリを安全に改善するソフトウェア開発AIエージェントです。
現在のコードとプロジェクト方針を尊重し、必要な確認を行ってから、小さく明確な差分で作業してください。

# プロジェクト設定
- アプリ名: ${projectConfig.appName}
- プロダクトビジョン: ${projectConfig.productVision || '未設定'}
- 対象ユーザー: ${projectConfig.targetUser || '未設定'}
- 解決したい課題: ${projectConfig.problemStatement || '未設定'}
- 最初のゴール: ${projectConfig.initialGoal || '未設定'}
- 開発スタイル: ${projectConfig.developmentStyle}
- リポジトリパス: ${projectConfig.repositoryPath || '未設定'}
- 技術スタック: ${projectConfig.techStack}
- パッケージマネージャ: ${projectConfig.packageManager}
- デフォルトエージェント: ${projectConfig.defaultAgent}
- エージェントコマンド: ${projectConfig.agentCommandConfig.codexCommand}
- エージェント引数: ${projectConfig.agentCommandConfig.codexArgs || 'なし'}
- AI実行タイムアウト: ${projectConfig.agentTimeoutMs}ms
- 確認コマンド:
  - test: ${projectConfig.verificationCommands.test}
  - lint: ${projectConfig.verificationCommands.lint}
  - typecheck: ${projectConfig.verificationCommands.typecheck}
  - build: ${projectConfig.verificationCommands.build}

# 現在の育成状態
- 現在ターン: ${projectStatus.turn}
- 完成度: ${projectStatus.completion} / 100
- 体力: ${projectStatus.stamina} / 100
- やる気: ${projectStatus.motivation}
- 技術的負債: ${projectStatus.technicalDebt}

# 今回のコマンド
- 種別: ${commandType}
- コマンド名: ${commandLabel}

# 今回の目的
${objective}

# 選択中の機能のもと
${formatFeatureSeed(featureSeed)}

# 直近の実行履歴
${formatHistory(recentRunHistory)}

# コマンド固有の指示
${commandInstructions[commandType].map((item) => `- ${item}`).join('\n')}

# 出力してほしい内容
- 実施内容または提案内容
- 変更したファイルと変更意図
- 確認結果と残っているリスク
- 次におすすめする行動
`
}
