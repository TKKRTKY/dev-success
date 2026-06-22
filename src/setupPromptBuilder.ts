import type { ProjectConfig } from './domain/types'

export interface BuildSetupParsePromptInput {
  rawInput: string
  currentFormValues?: Partial<ProjectConfig>
  scenarioMaxTurn?: number
}

export const buildSetupParsePrompt = ({
  rawInput,
  currentFormValues,
  scenarioMaxTurn,
}: BuildSetupParsePromptInput): string => `あなたは、アプリ開発の初期設定を整理するアシスタントです。
ユーザーの雑なメモ、長文、箇条書きから、Dev Successの初期設定フォーム用の下書きを作ってください。

# ルール
- 既存フォーム値がある場合は尊重し、明確な根拠がない限り変更しない
- 不明な項目を無理に断定しない
- 推測した内容はassumptionsへ入れる
- 開始前に確認した方がよい重要事項だけをquestionsへ入れる
- questionsは多くても3件程度にする
- repositoryPathが不明なら空文字にする
- scenarioMaxTurnは8、12、24のいずれかにする
- confidenceは0から1の数値にする
- 説明文、Markdown、コードフェンスを付けずJSONだけを返す

# ユーザーのメモ
${rawInput}

# 現在のフォーム値
${JSON.stringify(
  {
    ...(currentFormValues ?? {}),
    scenarioMaxTurn,
  },
  null,
  2,
)}

# 返却形式
{
  "draft": {
    "appName": "string",
    "productVision": "string",
    "targetUser": "string",
    "problemStatement": "string",
    "initialGoal": "string",
    "techStack": "string",
    "repositoryPath": "string",
    "packageManager": "npm | pnpm | yarn | bun | other",
    "defaultAgent": "codex | claude-code | opencode | cursor | devin | manual | other",
    "developmentStyle": "safe | fast | experimental | quality-focused",
    "scenarioMaxTurn": 12,
    "verificationCommands": {
      "test": "string",
      "lint": "string",
      "typecheck": "string",
      "build": "string"
    },
    "assumptions": ["string"],
    "questions": ["string"],
    "confidence": 0.0
  },
  "assistantMessage": "string"
}`
