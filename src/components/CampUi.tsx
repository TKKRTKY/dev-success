import type { ReactNode } from 'react'
import { commandDefinitions } from '../domain/commands'
import { COMMANDS } from '../domain/types'
import type {
  CommandAvailability,
  CommandType,
  AgentConnectionResponse,
  FeatureSeed,
  FeatureSeedOption,
  Motivation,
  ProjectStatus,
  ReleaseJudgement,
} from '../domain/types'
import {
  featureSeedCategoryLabel,
  featureSeedDifficultyLabel,
  formatFeatureSeedEffects,
} from '../featureSeedGenerator'

export const AppShell = ({
  children,
  scene,
}: {
  children: ReactNode
  scene?: string
}) => (
  <main className={`app-shell camp-shell${scene ? ` scene-${scene}` : ''}`}>
    <div className="ambient ambient--one" />
    <div className="ambient ambient--two" />
    {children}
  </main>
)

export const StatusHeader = ({
  appName,
  status,
  maxTurn,
  latestReleaseJudgement,
}: {
  appName: string
  status: ProjectStatus
  maxTurn: number
  latestReleaseJudgement?: ReleaseJudgement
}) => (
  <section className="game-status-header">
    <div className="game-status-title">
      <span>育成中アプリ</span>
      <strong>{appName}</strong>
    </div>
    <div><span>ターン</span><strong>{status.turn} / {maxTurn}</strong></div>
    <div><span>残り</span><strong>{Math.max(maxTurn - status.turn, 0)}</strong></div>
    <div><span>完成度</span><strong>{status.completion}%</strong></div>
    <div><span>体力</span><strong>{status.stamina}</strong></div>
    <div><span>やる気</span><strong>{status.motivation}</strong></div>
    <div><span>負債</span><strong>{status.technicalDebt}</strong></div>
    <div><span>評価</span><strong>{latestReleaseJudgement?.rank ?? '—'}</strong></div>
  </section>
)

export const CharacterStage = ({
  appName,
  message,
  plannedCount,
  buildingSeed,
  uncheckedCount,
  completion,
}: {
  appName: string
  message: string
  plannedCount: number
  buildingSeed?: FeatureSeed
  uncheckedCount: number
  completion: number
}) => {
  const mascot = completion >= 75 ? '🚀' : completion >= 40 ? '🛠️' : '🌱'
  return (
    <section className="character-stage">
      <div className="project-mascot" aria-hidden="true">{mascot}</div>
      <div className="project-stage-copy">
        <span>NOW DEVELOPING</span>
        <h2>{appName}</h2>
        <p>{message}</p>
        <div>
          <i>機能の元 {plannedCount}</i>
          <i>実装中 {buildingSeed?.title ?? 'なし'}</i>
          <i>未確認 {uncheckedCount}</i>
        </div>
      </div>
    </section>
  )
}

const StatBar = ({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'blue' | 'green' | 'amber'
}) => (
  <div className="stat-row">
    <div className="stat-label">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
    <div
      className="stat-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className={`stat-fill stat-fill--${tone}`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
)

export const StatusPanel = ({
  status,
  maxTurn,
}: {
  status: ProjectStatus
  maxTurn: number
}) => (
  <section className="panel status-panel camp-side-card">
    <div className="panel-heading">
      <div>
        <span className="section-number">PROJECT POWER</span>
        <h2>プロジェクト能力</h2>
      </div>
      <span className="live-dot">
        あと {Math.max(maxTurn - status.turn, 0)} ターン
      </span>
    </div>
    <div className="status-stack">
      <StatBar label="完成度" value={status.completion} tone="blue" />
      <StatBar label="体力" value={status.stamina} tone="green" />
      <StatBar
        label="技術的負債"
        value={Math.min(status.technicalDebt, 100)}
        tone="amber"
      />
    </div>
    <div className="motivation-card">
      <span>今日の調子</span>
      <strong>{status.motivation}</strong>
      <div className="motivation-pips" aria-hidden="true">
        {(['絶不調', '不調', '普通', '好調', '絶好調'] as Motivation[]).map(
          (motivation) => (
            <i
              key={motivation}
              className={motivation === status.motivation ? 'is-active' : ''}
            />
          ),
        )}
      </div>
    </div>
  </section>
)

export const CommandMenu = ({
  availability,
  runningCommand,
  onCommand,
  onRelease,
  onNavigate,
}: {
  availability: CommandAvailability
  runningCommand: CommandType | null
  onCommand: (command: CommandType) => void
  onRelease: () => void
  onNavigate: (scene: 'repository' | 'settings' | 'history') => void
}) => (
  <div className="command-grid camp-command-grid">
    {COMMANDS.map((command, index) => {
      const definition = commandDefinitions[command]
      const commandAvailability = availability[command]
      const disabled = runningCommand !== null || !commandAvailability.enabled
      return (
        <button
          key={command}
          className={`command-card command-card--${command}${disabled ? ' is-locked' : ''}`}
          type="button"
          onClick={() => onCommand(command)}
          disabled={disabled}
          title={commandAvailability.reason}
        >
          <span className="command-number">{index + 1}</span>
          <span className="command-icon">{definition.icon}</span>
          <span className="command-copy">
            <strong>
              {runningCommand === command ? '実行中…' : definition.label}
            </strong>
            <small>
              {commandAvailability.reason ?? definition.description}
            </small>
          </span>
          <span className="command-arrow">決定</span>
        </button>
      )
    })}
    <button
      className="command-card command-card--release"
      type="button"
      onClick={onRelease}
      disabled={runningCommand !== null}
    >
      <span className="command-number">5</span>
      <span className="command-icon">◎</span>
      <span className="command-copy">
        <strong>リリース判定</strong>
        <small>いまの仕上がりを採点してもらう</small>
      </span>
      <span className="command-arrow">決定</span>
    </button>
    {([
      ['repository', '⌁', 'リポジトリ', '状態・差分を確認する'],
      ['settings', '⚙', '設定', 'プロジェクト設定を変更する'],
      ['history', '▤', '履歴', 'これまでの行動を見る'],
    ] as const).map(([scene, icon, label, description], index) => (
      <button
        key={scene}
        className={`command-card command-card--${scene}`}
        type="button"
        onClick={() => onNavigate(scene)}
        disabled={runningCommand !== null}
      >
        <span className="command-number">{index + 6}</span>
        <span className="command-icon">{icon}</span>
        <span className="command-copy">
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <span className="command-arrow">決定</span>
      </button>
    ))}
  </div>
)

export const FeatureSeedSlots = ({
  plannedSeeds,
  buildingSeed,
  onDiscard,
}: {
  plannedSeeds: FeatureSeed[]
  buildingSeed?: FeatureSeed
  onDiscard: (seed: FeatureSeed) => void
}) => (
  <section className="feature-seed-slots camp-side-card">
    <div className="feature-seed-selection-heading">
      <span>IDEA POCKET</span>
      <strong>機能の元ポケット {plannedSeeds.length} / 3</strong>
    </div>
    {buildingSeed && (
      <article className="camp-building-slot">
        <span>ただいま育成中！</span>
        <strong>{buildingSeed.title}</strong>
        <small>{featureSeedCategoryLabel(buildingSeed.category)}</small>
      </article>
    )}
    <div className="feature-seed-slot-grid">
      {Array.from({ length: 3 }, (_, index) => {
        const seed = plannedSeeds[index]
        return seed ? (
          <article key={seed.id} className="feature-seed-slot">
            <div className="feature-seed-tags">
              <span>{featureSeedCategoryLabel(seed.category)}</span>
              <span>{featureSeedDifficultyLabel(seed.difficulty)}</span>
            </div>
            <strong>{seed.title}</strong>
            <p>{seed.description}</p>
            <small>{formatFeatureSeedEffects(seed.effects)}</small>
            <button
              className="feature-seed-discard-button"
              type="button"
              onClick={() => onDiscard(seed)}
            >
              破棄
            </button>
          </article>
        ) : (
          <div
            key={`empty-${index}`}
            className="feature-seed-slot feature-seed-slot--empty"
          >
            <span>SLOT {index + 1}</span>
            <strong>まだ空っぽ</strong>
          </div>
        )
      })}
    </div>
  </section>
)

export const IdeaOptionCard = ({
  option,
  onSelect,
}: {
  option: FeatureSeedOption
  onSelect: (option: FeatureSeedOption) => void
}) => (
  <article className="feature-seed-card idea-option-card">
    <div className="feature-seed-tags">
      <span>{featureSeedCategoryLabel(option.category)}</span>
      <span>難易度 {featureSeedDifficultyLabel(option.difficulty)}</span>
    </div>
    <h3>{option.title}</h3>
    <p>{option.description}</p>
    <dl>
      <div>
        <dt>期待する効果</dt>
        <dd>{option.expectedImpact}</dd>
      </div>
      <div>
        <dt>リスク</dt>
        <dd>{option.risk}</dd>
      </div>
      <div>
        <dt>ステータス効果</dt>
        <dd>{formatFeatureSeedEffects(option.effects)}</dd>
      </div>
    </dl>
    <button type="button" onClick={() => onSelect(option)}>
      これを育てる！
    </button>
  </article>
)

export const ImplementationReviewPanel = ({
  children,
}: {
  children: ReactNode
}) => <section className="implementation-review-panel">{children}</section>

export const ReleaseJudgementPanel = ({
  children,
}: {
  children: ReactNode
}) => <section className="release-panel camp-release-panel">{children}</section>

export const ResultLog = ({ children }: { children: ReactNode }) => (
  <section className="camp-result-log">{children}</section>
)

export const AgentConnectionCheck = ({
  checking,
  result,
  onCheck,
}: {
  checking: boolean
  result: AgentConnectionResponse | null
  onCheck: () => void
}) => (
  <div className="agent-connection-check">
    <button type="button" onClick={onCheck} disabled={checking}>
      {checking ? 'Codexを確認中…' : 'Codex疎通確認'}
    </button>
    {result && (
      <p
        className={result.success ? 'is-success' : 'is-error'}
        role="status"
      >
        <strong>{result.success ? '接続OK' : '接続できません'}</strong>
        {' / '}
        {result.version ||
          result.error ||
          result.stderr.trim() ||
          '応答がありませんでした。'}
      </p>
    )}
  </div>
)
