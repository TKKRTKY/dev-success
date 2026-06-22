# Dev Success

AIエージェントとのアプリケーション開発を、ターン制の育成シミュレーション風UIで進めるローカル開発支援ツールです。

> 現在はMVPです。信頼できるローカルリポジトリで、Gitの状態を確認しながら使用してください。

## Dev Successとは

Dev Successは、アプリ開発を「考える」「作る」「確かめる」「整える」のターンで進めるツールです。

人間が毎回ゼロからプロンプトを書くのではなく、「考える」で提示される3つのアイデアから次に育てる機能を選びます。選んだアイデアは`FeatureSeed`（機能の元）として保存され、「作る」でCodex CLIなどのAIエージェントへ実装を依頼できます。

AIの実行だけで自動的に完成扱いにはなりません。`git diff`、typecheck、testなどの結果をImplementation Reviewで確認し、ユーザーが「この機能を完成にする」を選んだときにbuilt状態へ進みます。

## コンセプト

- 限られたターン内でMVPリリースを目指す
- 自由入力を初期設定中心にし、普段は選択式で開発を進める
- AIへ実装を任せても、差分と確認結果は人間が判断する
- 完成度、体力、やる気、技術的負債を見ながら作業方針を選ぶ
- 特定の既存ゲームを再現せず、独自の開発育成UIとして構成する

## 主な機能

- 新規プロジェクト開始とシナリオのターン設定
- AI生成またはローカルfallbackによる3択FeatureSeed生成
- planned FeatureSeedの最大3個保持、選択、破棄
- FeatureSeedをplanned → building → builtへ進める2段階の実装フロー
- Codex / Claude Code / OpenCode のCLI連携と手動AI連携
- エージェント実行後の`git diff`自動取得
- Agent実行結果、差分、確認結果をまとめるImplementation Review
- FeatureSeedと差分リスクに応じた推奨確認コマンド
- test / lint / typecheck / buildの自動実行または手動取り込み
- built済みFeatureSeedの完成サマリーと確認履歴
- プロジェクト状況を要約する「整える」
- 通常・最終リリース判定
- localStorageによる状態保存と復元
- 実行履歴タイムライン
- 開発・プレイテスト用Debug Panel

## 基本のゲームループ

1. **新規プロジェクト開始**  
   アプリのビジョン、対象ユーザー、最初のゴール、技術スタック、リポジトリパスなどを設定します。

2. **考える**  
   現在の状態から3つのアイデアを生成します。1つ選ぶと「機能の元」になります。

3. **作る**  
   planned状態の機能の元を選び、実装プロンプトを生成します。Codex / Claude Code / OpenCodeのいずれかで実行するか、外部のAIツールへ手動で渡します。

4. **実装レビュー**  
   Agent実行結果、`git diff`、変更ファイル、推奨確認コマンド、懸念事項を確認します。

5. **完成にする**  
   実装結果を入力して完成操作を行うと、FeatureSeedがbuiltになり、完成サマリーとRunHistoryが作成されます。

6. **確かめる**  
   built済み機能を選び、test / lint / typecheck / buildの結果をFeatureSeedへ紐づけます。

7. **整える**  
   直近の進捗や未確認事項を整理し、次の「考える」で優先する方向を更新します。

8. **リリース判定**  
   完成度、技術的負債、built済み機能、確認状態から現在のリリース準備度を評価します。

9. **最終リリース判定**  
   最終評価を作成してシナリオを終了します。終了後は開発コマンドが無効になります。

## セットアップ

### 必要な環境

- Node.js 20以上を推奨
- npm
- Git
- Codex連携を使う場合は、実行可能なCodex CLI
- 操作対象となるローカルGitリポジトリ

### インストール

```bash
npm install
```

## 起動方法

frontendとbackendをまとめて起動します。

```bash
npm run dev
```

- Vite frontend: `http://127.0.0.1:5173`
- Node / Express backend: `http://127.0.0.1:3001`
- frontendの`/api`リクエストはViteからbackendへproxyされます

別々に起動したい場合は、2つのターミナルで実行します。

```bash
npm run dev:server
```

```bash
npm run dev:web
```

品質確認に使用できるスクリプト:

```bash
npm run typecheck
npm run lint
npm run build
```

`npm run preview`はViteのビルド済みfrontendを確認するためのスクリプトです。リポジトリ操作APIを使う場合はbackendも別途起動してください。

## AI CLIエージェント連携

自動実装には、対象のCLIエージェントがローカル環境へインストールされ、ターミナルから実行できる必要があります。現在、自動実行に対応しているのは次の3つです。

| エージェント | `defaultAgent` | 既定コマンド | 既定引数 | プロンプトの渡し方 |
| --- | --- | --- | --- | --- |
| Codex CLI | `codex` | `codex` | `exec -` | 標準入力 |
| Claude Code | `claude-code` | `claude` | `-p --permission-mode acceptEdits` | 標準入力 |
| OpenCode | `opencode` | `opencode` | `run` | 最後の引数 |

ProjectConfigで次の項目を設定します。

- `repositoryPath`: 操作対象のGitリポジトリ
- `defaultAgent`: 上記のいずれか（または手動連携の`manual`）
- `agentCommandConfig.codexCommand`: 実行するコマンド名。エージェントを切り替えると既定値へ自動で合わせます。任意の絶対パスも指定できます
- `agentCommandConfig.codexArgs`: 利用中のCLIに必要な引数
- `agentTimeoutMs`: 実行タイムアウト。最大120,000ms

> `codexCommand` / `codexArgs` は履歴的な名称ですが、選択中エージェントの汎用コマンド・引数として扱われます。

Dev Successは、設定されたリポジトリを作業ディレクトリとしてCLIを起動し、実装プロンプトを標準入力またはコマンド引数で渡します。許可するコマンド名はエージェントごとに制限され（例: `claude-code`なら`claude`のみ）、CLIのコマンド形式は環境やバージョンで異なる可能性があるため、必要な実行モードを引数で設定してください。

実行後もFeatureSeedは自動的にbuiltになりません。次の順で確認してください。

1. 自動取得された`git diff`を確認する
2. 推奨されたtypecheck / test / buildなどを実行する
3. stdout / stderr、差分、確認結果、懸念事項を見る
4. 問題がなければ実装結果を入力し、「この機能を完成にする」を押す

CLIエージェントを使えない環境では、`defaultAgent`を`manual`に設定できます。生成されたプロンプトをコピーして任意のAIツールで実行し、その結果や差分、確認結果を手動で取り込めます。

## 使い方

1. 開始画面でプロジェクト情報とシナリオ期間を入力する
2. `repositoryPath`に対象Gitリポジトリの絶対パスを設定する
3. 「開発スタート！」を押す
4. 「考える」で3択を生成し、育てる機能を選ぶ
5. 「作る」で対象FeatureSeedをbuildingにする
6. Codexで実行するか、プロンプトをコピーして手動実装する
7. Implementation Reviewで差分と確認結果を見る
8. 実装結果を入力してbuiltにする
9. 「確かめる」「整える」を使いながら品質と状態を改善する
10. リリース判定を行い、最後に最終リリース判定でシナリオを終える

## 推奨プレイ手順

最初の1周は次の順番がおすすめです。

```text
考える
  ↓
小さなFeatureSeedを1つ選ぶ
  ↓
作る
  ↓
git diffを確認
  ↓
typecheck
  ↓
test または build
  ↓
完成にする
  ↓
確かめる
  ↓
整える
  ↓
リリース判定
```

差分リスクがhighの場合や確認に失敗した場合は、完成を急がず、結果を修正してから再確認してください。

## データ保存について

プロジェクト設定、ProjectStatus、FeatureSeed、Implementation Review、RunHistory、ContextSummary、ReleaseJudgement、シナリオ状態などはブラウザのlocalStorageへ保存されます。ページをリロードしても同じオリジンであれば状態を復元できます。

注意点:

- ブラウザ、プロファイル、ホスト名、ポート、ドメインが変わると状態が共有されない場合があります
- ブラウザのストレージ削除により状態は失われます
- サーバー側のデータベースや複数端末同期はありません
- Debug Panelから状態JSONの確認、コピー、インポート、リセットができます

## Debug Panel

画面の「Debug」ボタンから、開発・プレイテスト用パネルを開けます。

主な機能:

- DevSuccessStateの概要とJSON表示
- 状態JSONのコピーとインポート
- FeatureSeeds、ImplementationReviews、RunHistoryなどの部分リセット
- localStorageの完全リセット
- 最初から最後まで確認する通しプレイチェックリスト
- planned数、building数、参照関係、値の範囲などの状態整合性チェック
- ターンやステータスを調整するプレイテスト補助

Debug Panelは正式なゲーム進行用ではなく、localStorageの状態を直接操作する開発機能です。インポートやリセットの前に、必要な状態JSONをコピーしておくことをおすすめします。

## 安全上の注意

- このアプリは、設定したローカルリポジトリを作業ディレクトリとしてコマンドを実行します
- Codex CLIはファイルを作成・変更・削除する可能性があります
- test / lint / typecheck / buildも、プロジェクトのスクリプト内容によってはファイル生成や外部処理を行う可能性があります
- 信頼できるリポジトリと依存関係でのみ使用してください
- 実行前に`git status`を確認し、意図しない未保存変更がないか確認してください
- 重要な作業の前にはcommit、ブランチ作成、またはバックアップを推奨します
- Agent実行後は必ず`git diff`と確認コマンドの結果を確認してください

backendはコマンド文字列をシェルへ渡さず、Node.jsの`spawn` / `execFile`を`shell: false`で使用します。確認コマンドも実行可能なコマンド名をnpm、pnpm、yarn、bun、npx、bundle、rails系に制限し、明らかに危険なトークンを拒否します。ただし、許可されたpackage scriptの内部処理まで安全になるわけではありません。

## 現在の制限

- MVP段階であり、長期間・大規模開発向けの検証は限定的です
- AIが生成するFeatureSeed候補は正確性や実現可能性を保証しません
- AI候補の解析に失敗した場合はローカルmock候補へfallbackします
- 各CLIエージェントのコマンド、引数、認証、実行結果は環境やCLIバージョンに依存します
- 自動実行に対応するのはCodex / Claude Code / OpenCodeの3つです。cursorやdevinなどは設定値として選択できても、自動実行には未対応です
- 複数プロジェクトを切り替えて管理する機能はありません
- データ保存はlocalStorageのみで、サーバー同期はありません
- ランダムイベントやキャラクターイベントは未実装です
- 自動ブランチ作成、自動commit、自動pushは未実装です
- 自動E2Eテストは未整備で、現在はDebug Panelの手動チェックリストが中心です

## 今後の予定

- 複数プロジェクトの保存・切り替え
- 開発状況に応じた独自イベント
- AgentAdapterの追加と共通化（cursor / devin などの自動実行対応）
- 自動ブランチ作成
- 確認後の自動commit
- 実装レビューとゲーム画面のUI改善
- ブラウザE2Eテスト
- 設定・状態のexport / import強化
- リリース判定と完成サマリーの改善

