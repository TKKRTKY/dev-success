import { useState } from 'react'
import {
  PLAYTEST_CHECKLIST_STORAGE_KEY,
  type PersistedAppState,
} from '../storage'
import { validateDevSuccessState } from '../stateValidation'

const playtestItems = [
  { id: 'start-project', label: '新規プロジェクトを開始できる' },
  { id: 'think-options', label: '考えるで3択が表示される' },
  { id: 'select-seed', label: '3択から1つを機能の元として保存できる' },
  {
    id: 'planned-max-three',
    label: 'planned状態の機能の元が最大3個まで表示される',
  },
  { id: 'discard-seed', label: '機能の元を破棄できる' },
  { id: 'select-build', label: '作るでplanned FeatureSeedを選べる' },
  { id: 'become-building', label: '作る対象がbuildingになる' },
  { id: 'build-prompt', label: '実装プロンプトが生成される' },
  {
    id: 'agent-route',
    label: 'エージェント実行または手動実行導線が使える',
  },
  { id: 'auto-diff', label: 'エージェント実行後にgit diffが取得される' },
  { id: 'review-updated', label: 'ImplementationReviewが更新される' },
  {
    id: 'recommended-verifications',
    label: '推奨確認コマンドが表示される',
  },
  {
    id: 'record-verification',
    label: '確認コマンド結果を記録できる',
  },
  { id: 'complete-feature', label: 'この機能を完成にするでbuiltになる' },
  { id: 'completion-summary', label: '完成サマリーが表示される' },
  {
    id: 'select-built-verification',
    label: '確かめるでbuilt FeatureSeedを選べる',
  },
  {
    id: 'linked-verification',
    label: '確かめる結果がFeatureSeedに紐づく',
  },
  {
    id: 'organize-context',
    label: '整えるでContextSummaryが生成される',
  },
  { id: 'release-judgement', label: 'リリース判定ができる' },
  {
    id: 'complete-scenario',
    label: '最終リリース判定でscenarioStatusがcompletedになる',
  },
  { id: 'completed-screen', label: 'シナリオ終了画面が表示される' },
  { id: 'restart', label: 'はじめからで開始画面に戻れる' },
] as const

type ChecklistState = Record<string, boolean>

const emptyChecklist = (): ChecklistState =>
  Object.fromEntries(playtestItems.map((item) => [item.id, false]))

const loadChecklist = (): ChecklistState => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PLAYTEST_CHECKLIST_STORAGE_KEY) ?? '[]',
    )
    if (Array.isArray(parsed)) {
      return Object.fromEntries(
        playtestItems.map((item, index) => [item.id, parsed[index] === true]),
      )
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      return Object.fromEntries(
        playtestItems.map((item) => [item.id, record[item.id] === true]),
      )
    }
    return emptyChecklist()
  } catch {
    return emptyChecklist()
  }
}

interface DebugPanelProps {
  state: PersistedAppState
  onImport: (serialized: string) => string | undefined
  onResetFeatureSeeds: () => void
  onResetImplementationReviews: () => void
  onResetRunHistory: () => void
  onResetContextSummary: () => void
  onResetReleaseJudgements: () => void
  onFullReset: () => void
  onAdvanceTurn: () => void
  onRestoreStamina: () => void
  onClearTechnicalDebt: () => void
  onAddDummyFeatureSeed: () => void
  onResumeScenario: () => void
}

const JsonDetails = ({
  label,
  value,
}: {
  label: string
  value: unknown
}) => (
  <details className="debug-json">
    <summary>{label}</summary>
    <pre>{JSON.stringify(value, null, 2)}</pre>
  </details>
)

export const DebugPanel = ({
  state,
  onImport,
  onResetFeatureSeeds,
  onResetImplementationReviews,
  onResetRunHistory,
  onResetContextSummary,
  onResetReleaseJudgements,
  onFullReset,
  onAdvanceTurn,
  onRestoreStamina,
  onClearTechnicalDebt,
  onAddDummyFeatureSeed,
  onResumeScenario,
}: DebugPanelProps) => {
  const [open, setOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')
  const [checklist, setChecklist] = useState(loadChecklist)
  const [validation, setValidation] = useState(() =>
    validateDevSuccessState(state),
  )
  const counts = {
    planned: state.featureSeeds.filter((seed) => seed.status === 'planned')
      .length,
    building: state.featureSeeds.filter((seed) => seed.status === 'building')
      .length,
    built: state.featureSeeds.filter((seed) => seed.status === 'built').length,
    discarded: state.featureSeeds.filter(
      (seed) => seed.status === 'discarded',
    ).length,
  }

  const copyState = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2))
      setMessage('DevSuccessStateをコピーしました。')
    } catch {
      setMessage('クリップボードへコピーできませんでした。')
    }
  }

  const importState = () => {
    if (!importText.trim()) {
      setMessage('インポートするJSONを入力してください。')
      return
    }
    if (
      !window.confirm(
        '現在のlocalStorage状態を、入力したDevSuccessStateで置き換えますか？',
      )
    ) {
      return
    }
    const error = onImport(importText)
    setMessage(error ?? 'DevSuccessStateを復元しました。')
    if (!error) setImportText('')
  }

  const updateChecklist = (id: string, checked: boolean) => {
    const next = { ...checklist, [id]: checked }
    setChecklist(next)
    try {
      localStorage.setItem(
        PLAYTEST_CHECKLIST_STORAGE_KEY,
        JSON.stringify(next),
      )
    } catch {
      setMessage('チェックリストを保存できませんでした。')
    }
  }

  const resetChecklist = () => {
    if (!window.confirm('通しプレイテストのチェックをすべて外しますか？')) {
      return
    }
    const next = emptyChecklist()
    setChecklist(next)
    try {
      localStorage.setItem(
        PLAYTEST_CHECKLIST_STORAGE_KEY,
        JSON.stringify(next),
      )
    } catch {
      setMessage('チェックリストを保存できませんでした。')
    }
  }

  return (
    <aside className={`debug-panel${open ? ' is-open' : ''}`}>
      <button
        className="debug-toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Debugを閉じる' : 'Debug'}
      </button>
      {open && (
        <div className="debug-drawer">
          <header>
            <div>
              <span>DEVELOPMENT ONLY</span>
              <h2>開発者パネル</h2>
            </div>
            <strong>localStorageの状態を直接操作します</strong>
          </header>

          <section className="debug-summary">
            <dl>
              <div><dt>isStarted</dt><dd>{String(state.isStarted)}</dd></div>
              <div><dt>scenarioStatus</dt><dd>{state.scenarioStatus}</dd></div>
              <div><dt>turn</dt><dd>{state.projectStatus.turn} / {state.scenarioConfig.maxTurn}</dd></div>
              <div><dt>planned</dt><dd>{counts.planned}</dd></div>
              <div><dt>building</dt><dd>{counts.building}</dd></div>
              <div><dt>built</dt><dd>{counts.built}</dd></div>
              <div><dt>discarded</dt><dd>{counts.discarded}</dd></div>
              <div><dt>reviews</dt><dd>{state.implementationReviews.length}</dd></div>
              <div><dt>runHistory</dt><dd>{state.runHistory.length}</dd></div>
              <div><dt>release</dt><dd>{state.latestReleaseJudgement ? 'あり' : 'なし'}</dd></div>
              <div><dt>context</dt><dd>{state.contextSummary ? 'あり' : 'なし'}</dd></div>
            </dl>
            <JsonDetails label="ProjectStatus" value={state.projectStatus} />
          </section>

          <section className="debug-actions">
            <h3>プレイテスト補助</h3>
            <div>
              <button type="button" onClick={onAdvanceTurn}>turn +1</button>
              <button type="button" onClick={onRestoreStamina}>体力100</button>
              <button type="button" onClick={onClearTechnicalDebt}>負債0</button>
              <button type="button" onClick={onAddDummyFeatureSeed}>ダミーFeatureSeed</button>
              <button type="button" onClick={onResumeScenario}>playingへ戻す</button>
            </div>
          </section>

          <section className="debug-playtest">
            <div className="debug-section-heading">
              <div>
                <h3>通しプレイテスト</h3>
                <small>
                  {Object.values(checklist).filter(Boolean).length} /{' '}
                  {playtestItems.length}{' '}
                  完了
                </small>
              </div>
              <button type="button" onClick={resetChecklist}>
                チェックリストをリセット
              </button>
            </div>
            <div className="debug-checklist">
              {playtestItems.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={checklist[item.id] ?? false}
                    onChange={(event) =>
                      updateChecklist(item.id, event.target.checked)
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="debug-validation">
            <div className="debug-section-heading">
              <div>
                <h3>状態整合性チェック</h3>
                <small>
                  {validation.ok ? 'OK' : 'NOT OK'} / errors{' '}
                  {validation.errorCount} / warnings {validation.warningCount}{' '}
                  / info {validation.infoCount}
                </small>
              </div>
              <button
                type="button"
                onClick={() => setValidation(validateDevSuccessState(state))}
              >
                状態を検証
              </button>
            </div>
            <div
              className={`debug-validation-status${
                validation.ok ? ' is-ok' : ' is-error'
              }`}
            >
              {validation.ok ? 'OK' : 'NOT OK'}
            </div>
            <ul className="debug-issue-list">
              {validation.issues.map((issue, index) => (
                <li
                  key={`${issue.severity}-${issue.message}-${index}`}
                  className={`is-${issue.severity}`}
                >
                  <span>{issue.severity}</span>
                  <div>
                    <strong>{issue.message}</strong>
                    {issue.path && <code>{issue.path}</code>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="debug-json-list">
            <h3>JSON表示</h3>
            <JsonDetails label="ProjectConfig" value={state.projectConfig} />
            <JsonDetails label="ScenarioConfig" value={state.scenarioConfig} />
            <JsonDetails label="FeatureSeeds" value={state.featureSeeds} />
            <JsonDetails label="ImplementationReviews" value={state.implementationReviews} />
            <JsonDetails label="RunHistory" value={state.runHistory} />
            <JsonDetails label="ContextSummary" value={state.contextSummary} />
            <JsonDetails label="ReleaseJudgements" value={state.releaseJudgements} />
            <JsonDetails label="DevSuccessState全体" value={state} />
          </section>

          <section className="debug-import">
            <div>
              <h3>状態コピー・インポート</h3>
              <button type="button" onClick={() => void copyState()}>
                状態をコピー
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="DevSuccessStateのJSONを貼り付け"
              rows={7}
            />
            <button type="button" onClick={importState}>状態をインポート</button>
          </section>

          <section className="debug-danger">
            <h3>部分リセット</h3>
            <div>
              <button type="button" onClick={onResetFeatureSeeds}>FeatureSeeds</button>
              <button type="button" onClick={onResetImplementationReviews}>ImplementationReviews</button>
              <button type="button" onClick={onResetRunHistory}>RunHistory</button>
              <button type="button" onClick={onResetContextSummary}>ContextSummary</button>
              <button type="button" onClick={onResetReleaseJudgements}>ReleaseJudgements</button>
              <button className="is-danger" type="button" onClick={onFullReset}>
                localStorage完全リセット
              </button>
            </div>
          </section>
          {message && <p className="debug-message">{message}</p>}
        </div>
      )}
    </aside>
  )
}
