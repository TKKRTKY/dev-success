import { useState } from 'react'
import './App.css'
import './CampTheme.css'
import './CampGameTheme.css'
import { commandDefinitions } from './domain/commands'
import { getCommandAvailability } from './domain/commandAvailability'
import { initialProjectConfig } from './domain/projectConfig'
import { createInitialScenarioConfig } from './domain/scenario'
import {
  applyStatusChanges,
  applyRunResult,
  formatStatusChanges,
  getActualStatusChanges,
  initialProjectStatus,
} from './domain/status'
import { COMMANDS } from './domain/types'
import {
  CLI_AGENT_SPECS,
  SELECTABLE_AGENT_KINDS,
  getAgentLabel,
  isAutoRunAgentKind,
  isCliAgentKind,
  resolveAgentCommandConfig,
} from './domain/agents'
import type {
  AgentAdapter,
  AgentConnectionResponse,
  AgentKind,
  AgentRunResponse,
  CommandType,
  DevelopmentStyle,
  FeatureSeed,
  FeatureSeedOption,
  FeatureVerification,
  GitDiffSummary,
  IdeaGenerationInfo,
  ImplementationReview,
  PackageManager,
  ParsedVerificationResult,
  ProjectConfig,
  ProjectContextSummary,
  ProjectSetupDraft,
  RepositoryDiff,
  RepositoryStatus,
  ReleaseJudgement,
  ScenarioConfig,
  ScenarioResult,
  ScenarioStatus,
  RunHistoryEntry,
  RunResult,
  StatusChanges,
  SetupParseResponse,
  ThinkAgentResponse,
  VerificationType,
  VerifyRepositoryResponse,
} from './domain/types'
import {
  featureSeedCategoryLabel,
  featureSeedDifficultyLabel,
  formatFeatureSeedEffects,
  generateFeatureSeedOptions,
} from './featureSeedGenerator'
import { createFeatureSeedRunResult } from './featureSeedResultParser'
import {
  buildProjectContextSummary,
  getOrganizeStatusChanges,
} from './contextSummaryBuilder'
import {
  featureVerificationStatusLabel,
  getFeatureVerificationStatus,
} from './featureVerification'
import {
  getGitDiffRecommendation,
  getGitDiffStatusChanges,
  parseGitDiffInput,
} from './gitDiffParser'
import { parsePastedAgentResult } from './pastedResultParser'
import { buildAgentPrompt } from './promptBuilder'
import {
  clearAppState,
  importAppState,
  loadAppState,
  saveAppState,
  STORAGE_VERSION,
} from './storage'
import type { PersistedAppState } from './storage'
import { evaluateReleaseReadiness } from './releaseReadiness'
import {
  createImplementationReview,
} from './implementationReview'
import { generateFeatureCompletionSummary } from './featureCompletionSummary'
import { buildThinkPrompt } from './thinkPromptBuilder'
import { parseThinkAgentApiResponse } from './thinkAgentParser'
import {
  applyProjectSetupDraft,
  createEditableProjectSetupDraft,
} from './setupDraft'
import {
  clearSetupState,
  loadSetupState,
  saveSetupState,
} from './setupStorage'
import {
  AppShell,
  AgentConnectionCheck,
  CharacterStage,
  CommandMenu,
  FeatureSeedSlots,
  IdeaOptionCard,
  ImplementationReviewPanel,
  ReleaseJudgementPanel,
  ResultLog,
  StatusHeader,
  StatusPanel,
} from './components/CampUi'
import { DebugPanel } from './components/DebugPanel'
import {
  createVerificationRunResult,
  createVerificationRunResultFromParsed,
} from './verificationParser'
import { useImplementationReview } from './hooks/useImplementationReview'

const verificationTypes: VerificationType[] = [
  'test',
  'lint',
  'typecheck',
  'build',
]

interface AppProps {
  agentAdapter: AgentAdapter
}

type PlayScene =
  | 'camp'
  | 'think'
  | 'build'
  | 'verify'
  | 'organize'
  | 'release'
  | 'repository'
  | 'settings'
  | 'history'
type SetupSection =
  | 'basic'
  | 'vision'
  | 'environment'
  | 'agent'
  | 'verification'
  | 'scenario'
  | 'confirm'

const sceneCopy: Record<
  Exclude<PlayScene, 'camp'>,
  { kicker: string; title: string; message: string }
> = {
  think: {
    kicker: 'IDEA TIME',
    title: '考える',
    message: 'ひらめきの時間です。次に育てる機能を見つけましょう！',
  },
  build: {
    kicker: 'BUILD TIME',
    title: '作る',
    message: '機能の元をひとつ選んで、実装を進めましょう！',
  },
  verify: {
    kicker: 'CHECK TIME',
    title: '確かめる',
    message: '完成した機能をチェックして、安心度を上げましょう！',
  },
  organize: {
    kicker: 'REST TIME',
    title: '整える',
    message: 'ひと休みしながら、次の開発に備えて整理します。',
  },
  release: {
    kicker: 'JUDGEMENT',
    title: 'リリース判定',
    message: 'ここまで育てたアプリの仕上がりを見てもらいましょう！',
  },
  repository: {
    kicker: 'REPOSITORY',
    title: 'リポジトリ',
    message: '現在の変更状態とgit diffを確認します。',
  },
  settings: {
    kicker: 'SETTINGS',
    title: '設定',
    message: '開発環境とAIエージェントの設定を整えます。',
  },
  history: {
    kicker: 'HISTORY',
    title: '履歴',
    message: 'これまでの開発ターンを振り返ります。',
  },
}

function App({ agentAdapter }: AppProps) {
  const [initialState] = useState(loadAppState)
  const [initialSetupState] = useState(loadSetupState)
  const [isStarted, setIsStarted] = useState(
    initialState?.isStarted ?? false,
  )
  const [status, setStatus] = useState(
    initialState?.projectStatus ?? initialProjectStatus,
  )
  const [projectConfig, setProjectConfig] = useState<ProjectConfig>(
    initialState?.projectConfig ?? initialProjectConfig,
  )
  const [configDraft, setConfigDraft] = useState<ProjectConfig>(
    initialState?.projectConfig ?? initialProjectConfig,
  )
  const [configSaved, setConfigSaved] = useState(false)
  const [setupSection, setSetupSection] = useState<SetupSection>('basic')
  const [agentConnectionChecking, setAgentConnectionChecking] =
    useState(false)
  const [agentConnectionResult, setAgentConnectionResult] =
    useState<AgentConnectionResponse | null>(null)
  const [setupRawInput, setSetupRawInput] = useState(
    initialSetupState?.rawInput ?? '',
  )
  const [setupAdditionalAnswer, setSetupAdditionalAnswer] = useState(
    initialSetupState?.additionalAnswer ?? '',
  )
  const [setupDraft, setSetupDraft] = useState<
    ProjectSetupDraft | undefined
  >(initialSetupState?.draft)
  const [setupAssistantMessage, setSetupAssistantMessage] = useState(
    initialSetupState?.assistantMessage ?? '',
  )
  const [setupParseError, setSetupParseError] = useState('')
  const [setupParsing, setSetupParsing] = useState(false)
  const [results, setResults] = useState<RunHistoryEntry[]>(
    initialState?.runHistory ?? [],
  )
  const [selectedResult, setSelectedResult] = useState<RunHistoryEntry | null>(
    initialState?.runHistory.find(
      (entry) => entry.result.id === initialState.selectedResultId,
    ) ??
      initialState?.runHistory[0] ??
      null,
  )
  const [runningCommand, setRunningCommand] = useState<CommandType | null>(null)
  const [playScene, setPlayScene] = useState<PlayScene>('camp')
  const [promptCommand, setPromptCommand] = useState<CommandType>(
    initialState?.featureSeeds.some((seed) => seed.status === 'building')
      ? 'build'
      : 'think',
  )
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  const [buildingCopyState, setBuildingCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [pastedResult, setPastedResult] = useState('')
  const [gitDiffInput, setGitDiffInput] = useState('')
  const [verificationType, setVerificationType] =
    useState<VerificationType>('test')
  const [verificationCommand, setVerificationCommand] = useState(
    (initialState?.projectConfig ?? initialProjectConfig).verificationCommands
      .test,
  )
  const [verificationOutput, setVerificationOutput] = useState('')
  const [repositoryStatus, setRepositoryStatus] =
    useState<RepositoryStatus | null>(null)
  const [repositoryLoading, setRepositoryLoading] = useState(false)
  const [repositoryDiff, setRepositoryDiff] =
    useState<RepositoryDiff | null>(null)
  const [repositoryDiffLoading, setRepositoryDiffLoading] = useState(false)
  const [automatedVerification, setAutomatedVerification] =
    useState<VerifyRepositoryResponse | null>(null)
  const [runningVerificationType, setRunningVerificationType] =
    useState<VerificationType | null>(null)
  const [featureSeeds, setFeatureSeeds] = useState<FeatureSeed[]>(
    initialState?.featureSeeds ?? [],
  )
  const [latestIdeaOptions, setLatestIdeaOptions] = useState<
    FeatureSeedOption[]
  >(initialState?.latestIdeaOptions ?? [])
  const [ideaGenerationInfo, setIdeaGenerationInfo] = useState<
    IdeaGenerationInfo | undefined
  >(initialState?.ideaGenerationInfo)
  const [ideaGenerationStatus, setIdeaGenerationStatus] = useState<
    'idle' | 'generating' | 'ai' | 'repaired' | 'mixed' | 'fallback'
  >(
    initialState?.ideaGenerationInfo?.source ?? 'idle',
  )
  const [buildSelectionVisible, setBuildSelectionVisible] = useState(false)
  const [promptFeatureSeed, setPromptFeatureSeed] = useState<
    FeatureSeed | undefined
  >(initialState?.featureSeeds.find((seed) => seed.status === 'building'))
  const [implementationResult, setImplementationResult] = useState('')
  const [agentRunResult, setAgentRunResult] =
    useState<AgentRunResponse | null>(null)
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentRunStage, setAgentRunStage] = useState<
    'idle' | 'agent' | 'diff' | 'review'
  >('idle')
  const [verificationSelectionVisible, setVerificationSelectionVisible] =
    useState(false)
  const [selectedVerificationSeedId, setSelectedVerificationSeedId] =
    useState<string | null>(null)
  const [gameLoopMessage, setGameLoopMessage] = useState('')
  const [contextSummary, setContextSummary] = useState<
    ProjectContextSummary | undefined
  >(initialState?.contextSummary)
  const [latestReleaseJudgement, setLatestReleaseJudgement] = useState<
    ReleaseJudgement | undefined
  >(initialState?.latestReleaseJudgement)
  const [releaseJudgements, setReleaseJudgements] = useState<
    ReleaseJudgement[]
  >(initialState?.releaseJudgements ?? [])
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfig>(
    initialState?.scenarioConfig ??
      createInitialScenarioConfig(
        initialState?.projectConfig ?? initialProjectConfig,
      ),
  )
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatus>(
    initialState?.scenarioStatus ?? 'playing',
  )
  const [scenarioResult, setScenarioResult] = useState<
    ScenarioResult | undefined
  >(initialState?.scenarioResult)
  const [scenarioMaxTurnDraft, setScenarioMaxTurnDraft] = useState(
    initialState?.scenarioConfig.maxTurn ?? 12,
  )
  const {
    implementationReviews,
    setImplementationReviews,
    updateImplementationReview,
    getImplementationReview,
  } = useImplementationReview({
    initialReviews: initialState?.implementationReviews ?? [],
    featureSeeds,
    projectConfig,
    onChange: (nextReviews) => {
      saveAppState({
        projectConfig,
        projectStatus: status,
        runHistory: results,
        selectedResultId: selectedResult?.result.id ?? null,
        featureSeeds,
        latestIdeaOptions,
        contextSummary,
        implementationReviews: nextReviews,
      })
    },
  })
  const commandAvailability = getCommandAvailability({
    featureSeeds,
    scenarioStatus,
  })

  const recordRunResult = (
    result: RunResult,
    featureState?: {
      featureSeeds: FeatureSeed[]
      latestIdeaOptions: FeatureSeedOption[]
      contextSummary?: ProjectContextSummary
      latestReleaseJudgement?: ReleaseJudgement
      releaseJudgements?: ReleaseJudgement[]
    },
    advanceTurn = true,
  ) => {
    const recordedTurn = advanceTurn ? status.turn + 1 : status.turn
    const recordedResult: RunResult = {
      ...result,
      turn: recordedTurn,
      turnAdvanced: advanceTurn,
    }
    const entry = {
      result: recordedResult,
      turn: recordedTurn,
      motivationBefore: status.motivation,
    }
    const statusWithChanges = applyRunResult(status, recordedResult)
    const nextStatus = { ...statusWithChanges, turn: recordedTurn }
    const nextResults = [entry, ...results]
    const nextFeatureSeeds = featureState?.featureSeeds ?? featureSeeds
    const nextLatestIdeaOptions =
      featureState?.latestIdeaOptions ?? latestIdeaOptions
    const nextContextSummary =
      featureState?.contextSummary ?? contextSummary
    const nextLatestReleaseJudgement =
      featureState?.latestReleaseJudgement ?? latestReleaseJudgement
    const nextReleaseJudgements =
      featureState?.releaseJudgements ?? releaseJudgements

    setStatus(nextStatus)
    setResults(nextResults)
    setSelectedResult(entry)
    if (featureState) {
      setFeatureSeeds(nextFeatureSeeds)
      setLatestIdeaOptions(nextLatestIdeaOptions)
      if (featureState.contextSummary) {
        setContextSummary(featureState.contextSummary)
      }
      if (featureState.latestReleaseJudgement) {
        setLatestReleaseJudgement(featureState.latestReleaseJudgement)
      }
      if (featureState.releaseJudgements) {
        setReleaseJudgements(featureState.releaseJudgements)
      }
    }
    saveAppState({
      projectConfig,
      projectStatus: nextStatus,
      runHistory: nextResults,
      selectedResultId: recordedResult.id,
      featureSeeds: nextFeatureSeeds,
      latestIdeaOptions: nextLatestIdeaOptions,
      contextSummary: nextContextSummary,
      latestReleaseJudgement: nextLatestReleaseJudgement,
      releaseJudgements: nextReleaseJudgements,
      scenarioConfig,
      scenarioStatus,
      scenarioResult,
    })
  }

  const executeCommand = async (commandType: CommandType) => {
    if (runningCommand) return
    if (scenarioStatus === 'completed') {
      setGameLoopMessage(
        'シナリオは完了しています。「はじめから」で新しい挑戦を始められます。',
      )
      return
    }
    const availability =
      commandType === 'check' || commandType === 'release'
        ? { enabled: true }
        : commandAvailability[commandType]
    if (!availability.enabled) {
      setGameLoopMessage(availability.reason ?? '現在は実行できません。')
      return
    }

    setPromptCommand(commandType)
    setGameLoopMessage('')
    const plannedFeatureSeeds = featureSeeds.filter(
      (seed) => seed.status === 'planned',
    )
    const excludedThinkFeatureSeeds = featureSeeds.filter(
      (seed) => seed.status === 'planned' || seed.status === 'built',
    )

    if (commandType === 'think') {
      setBuildSelectionVisible(false)
      setPromptFeatureSeed(undefined)
      if (plannedFeatureSeeds.length >= 3) {
        setLatestIdeaOptions([])
        setGameLoopMessage(
          '機能の元がいっぱいです。先に「作る」でどれかを育てましょう。',
        )
        saveAppState({
          projectConfig,
          projectStatus: status,
          runHistory: results,
          selectedResultId: selectedResult?.result.id ?? null,
          featureSeeds,
          latestIdeaOptions: [],
          contextSummary,
        })
        return
      }
      const fallbackOptions = generateFeatureSeedOptions({
        projectStatus: status,
        projectConfig,
        runHistory: results,
        featureSeeds,
        contextSummary,
        scenarioConfig,
      })
      const createFallback = (error: string, rawOutput = '') => {
        const parsed = parseThinkAgentApiResponse(
          {
            success: false,
            options: [],
            rawOutput,
            error,
          },
          excludedThinkFeatureSeeds,
          fallbackOptions,
        )
        const generationInfo: IdeaGenerationInfo = {
          source: parsed.source,
          rawOutput,
          warnings: parsed.warnings,
          error,
          generatedAt: new Date().toISOString(),
        }
        setLatestIdeaOptions(parsed.options)
        setIdeaGenerationInfo(generationInfo)
        setIdeaGenerationStatus(parsed.source)
        setGameLoopMessage(
          'AI生成に失敗したため、ローカル候補を表示しています。',
        )
        saveAppState({
          projectConfig,
          projectStatus: status,
          runHistory: results,
          selectedResultId: selectedResult?.result.id ?? null,
          featureSeeds,
          latestIdeaOptions: parsed.options,
          ideaGenerationInfo: generationInfo,
          contextSummary,
        })
      }

      if (projectConfig.defaultAgent === 'manual') {
        createFallback('実行エージェントがmanualに設定されています。')
        return
      }

      setRunningCommand('think')
      setLatestIdeaOptions([])
      setIdeaGenerationStatus('generating')
      setIdeaGenerationInfo(undefined)
      setGameLoopMessage('AIが3つの機能候補を考えています…')
      const prompt = buildThinkPrompt({
        projectConfig,
        projectStatus: status,
        featureSeeds,
        runHistory: results,
        contextSummary,
        latestReleaseJudgement,
        scenarioConfig,
        scenarioStatus,
      })
      let latestRawOutput = ''
      try {
        const controller = new AbortController()
        const browserTimeout = window.setTimeout(
          () => controller.abort(),
          projectConfig.agentTimeoutMs + 5_000,
        )
        let response: Response
        try {
          response = await fetch('/api/agent/think', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              agentKind: projectConfig.defaultAgent,
              repositoryPath: projectConfig.repositoryPath,
              prompt,
              timeoutMs: projectConfig.agentTimeoutMs,
              codexCommand:
                projectConfig.agentCommandConfig.codexCommand,
              codexArgs: projectConfig.agentCommandConfig.codexArgs,
              plannedTitles: excludedThinkFeatureSeeds.map(
                (seed) => seed.title,
              ),
              fallbackOptions,
            }),
          })
        } finally {
          window.clearTimeout(browserTimeout)
        }
        const data = (await response.json()) as ThinkAgentResponse
        latestRawOutput = data.rawOutput
        const parsed = parseThinkAgentApiResponse(
          data,
          excludedThinkFeatureSeeds,
          fallbackOptions,
        )
        const generationInfo: IdeaGenerationInfo = {
          source: parsed.source,
          rawOutput: data.rawOutput,
          warnings: parsed.warnings,
          generatedAt: new Date().toISOString(),
        }
        setLatestIdeaOptions(parsed.options)
        setIdeaGenerationInfo(generationInfo)
        setIdeaGenerationStatus(parsed.source)
        setGameLoopMessage(
          parsed.source === 'ai'
            ? 'AIが現在のプロジェクトから候補を生成しました。育てたい機能を選んでください！'
            : parsed.source === 'repaired'
              ? 'AIが現在のプロジェクトから生成した候補を安全な形式に整えました。'
              : parsed.source === 'mixed'
                ? '一部候補をプロジェクト固有のローカル候補で補完しました。'
                : 'AI生成に失敗したため、ローカル候補を表示しています。',
        )
        saveAppState({
          projectConfig,
          projectStatus: status,
          runHistory: results,
          selectedResultId: selectedResult?.result.id ?? null,
          featureSeeds,
          latestIdeaOptions: parsed.options,
          ideaGenerationInfo: generationInfo,
          contextSummary,
        })
      } catch (error) {
        createFallback(
          error instanceof Error
            ? error.name === 'AbortError'
              ? 'AI候補生成がタイムアウトしました。'
              : error.message
            : 'AI候補生成に失敗しました。',
          latestRawOutput,
        )
      } finally {
        setRunningCommand(null)
      }
      return
    }

    if (commandType === 'build') {
      setLatestIdeaOptions([])
      const buildingSeed = featureSeeds.find(
        (seed) => seed.status === 'building',
      )
      if (buildingSeed) {
        setBuildSelectionVisible(false)
        setPromptFeatureSeed(buildingSeed)
        setGameLoopMessage(
          `「${buildingSeed.title}」を実装中です。結果を取り込むと完成になります。`,
        )
        return
      }
      if (plannedFeatureSeeds.length === 0) {
        setBuildSelectionVisible(false)
        setPromptFeatureSeed(undefined)
        setGameLoopMessage(
          'まだ機能の元がありません。まずは「考える」で次に育てる機能を見つけましょう。',
        )
        saveAppState({
          projectConfig,
          projectStatus: status,
          runHistory: results,
          selectedResultId: selectedResult?.result.id ?? null,
          featureSeeds,
          latestIdeaOptions: [],
          contextSummary,
        })
        return
      }
      setBuildSelectionVisible(true)
      setGameLoopMessage('今回作る「機能の元」を選んでください。')
      saveAppState({
        projectConfig,
        projectStatus: status,
        runHistory: results,
        selectedResultId: selectedResult?.result.id ?? null,
        featureSeeds,
        latestIdeaOptions: [],
        contextSummary,
      })
      return
    }

    if (commandType === 'verify') {
      const builtSeeds = featureSeeds.filter(
        (seed) => seed.status === 'built',
      )
      setBuildSelectionVisible(false)
      setLatestIdeaOptions([])
      if (builtSeeds.length === 0) {
        setVerificationSelectionVisible(false)
        setSelectedVerificationSeedId(null)
        setGameLoopMessage(
          'まだ確かめる機能がありません。まずは「作る」で機能を完成させましょう。',
        )
        return
      }
      setVerificationSelectionVisible(true)
      setGameLoopMessage('確認対象の完成済み機能を選んでください。')
      return
    }

    if (commandType === 'organize') {
      const nextContextSummary: ProjectContextSummary = {
        ...buildProjectContextSummary({
          projectStatus: status,
          projectConfig,
          runHistory: results,
          featureSeeds,
          repositoryStatus,
          repositoryDiff,
        }),
        turn: status.turn + 1,
      }
      const result: RunResult = {
        id: crypto.randomUUID(),
        turn: status.turn + 1,
        commandType: 'organize',
        title: 'プロジェクト状況を整理した',
        summary: nextContextSummary.summary,
        statusChanges: getActualStatusChanges(
          status,
          getOrganizeStatusChanges(nextContextSummary),
        ),
        changedFiles: [],
        logs: [
          ...nextContextSummary.recentProgress.map(
            (item) => `進捗: ${item}`,
          ),
          ...nextContextSummary.openConcerns.map(
            (item) => `懸念: ${item}`,
          ),
          ...nextContextSummary.nextThinkHints.map(
            (item) => `次のヒント: ${item}`,
          ),
        ],
        recommendation:
          nextContextSummary.openConcerns.length > 0
            ? '懸念を確認し、「考える」で次の小さな一手を選びましょう。'
            : '状況が整いました。「考える」で次の機能の元を探しましょう。',
        createdAt: nextContextSummary.generatedAt,
      }
      setBuildSelectionVisible(false)
      setVerificationSelectionVisible(false)
      setPromptFeatureSeed(undefined)
      setGameLoopMessage('プロジェクト状況を整理しました。')
      recordRunResult(result, {
        featureSeeds,
        latestIdeaOptions: [],
        contextSummary: nextContextSummary,
      })
      return
    }

    setRunningCommand(commandType)
    try {
      const result = await agentAdapter.run({
        commandType,
        projectStatus: status,
      })
      recordRunResult(result, undefined, false)
    } finally {
      setRunningCommand(null)
    }
  }

  const choosePlayCommand = (commandType: CommandType) => {
    const nextScene =
      commandType === 'check' ? 'verify' : commandType
    setPlayScene(nextScene as PlayScene)
    void executeCommand(commandType)
  }

  const chooseReleaseScene = () => {
    setPlayScene('release')
    judgeReleaseReadiness()
  }

  const selectFeatureSeed = (option: FeatureSeedOption) => {
    const plannedCount = featureSeeds.filter(
      (seed) => seed.status === 'planned',
    ).length
    if (plannedCount >= 3) {
      setLatestIdeaOptions([])
      setGameLoopMessage(
        '機能の元がいっぱいです。先に「作る」でどれかを育てましょう。',
      )
      return
    }

    const selectedAt = new Date().toISOString()
    const seed: FeatureSeed = {
      ...option,
      status: 'planned',
      createdTurn: status.turn + 1,
      selectedAt,
    }
    const nextFeatureSeeds = [seed, ...featureSeeds]
    const thinkDefinition = commandDefinitions.think
    const result: RunResult = {
      id: crypto.randomUUID(),
      turn: status.turn + 1,
      commandType: 'think',
      title: `${seed.title} が機能の元になった！`,
      summary: `${seed.description} 次は「作る」で、この機能を育てましょう。`,
      statusChanges: getActualStatusChanges(
        status,
        thinkDefinition.statusChanges,
      ),
      changedFiles: [],
      logs: [
        `category: ${seed.category}`,
        `difficulty: ${seed.difficulty}`,
        `implementation hint: ${seed.implementationHint}`,
        `risk: ${seed.risk}`,
      ],
      recommendation:
        '次は「作る」で、選んだ機能のもとを実装へ進めましょう。',
      createdAt: selectedAt,
    }

    setPromptCommand('think')
    setPromptFeatureSeed(undefined)
    setGameLoopMessage(
      `${seed.title} が機能の元になった！`,
    )
    recordRunResult(result, {
      featureSeeds: nextFeatureSeeds,
      latestIdeaOptions: [],
    })
  }

  const buildFeatureSeed = (seed: FeatureSeed) => {
    if (runningCommand || seed.status !== 'planned') return

    const buildingSeed: FeatureSeed = { ...seed, status: 'building' }
    const buildingFeatureSeeds = featureSeeds.map((featureSeed) =>
      featureSeed.id === seed.id ? buildingSeed : featureSeed,
    )
    const initialReview =
      implementationReviews.find(
        (review) => review.featureSeedId === seed.id,
      ) ?? createImplementationReview(seed.id)
    const nextImplementationReviews = [
      initialReview,
      ...implementationReviews.filter(
        (review) => review.featureSeedId !== seed.id,
      ),
    ]
    setPromptCommand('build')
    setPromptFeatureSeed(buildingSeed)
    setBuildingCopyState('idle')
    setBuildSelectionVisible(false)
    setFeatureSeeds(buildingFeatureSeeds)
    setImplementationResult('')
    setAgentRunResult(null)
    setAgentRunStage('idle')
    setImplementationReviews(nextImplementationReviews)
    setGameLoopMessage(
      `「${seed.title}」の実装を開始しました。プロンプトをコピーして実装結果を取り込んでください。`,
    )
    saveAppState({
      projectConfig,
      projectStatus: status,
      runHistory: results,
      selectedResultId: selectedResult?.result.id ?? null,
      featureSeeds: buildingFeatureSeeds,
      latestIdeaOptions,
      contextSummary,
      implementationReviews: nextImplementationReviews,
    })
  }

  const completeFeatureSeed = () => {
    const buildingSeed = featureSeeds.find(
      (seed) => seed.status === 'building',
    )
    if (!buildingSeed) return
    const implementationReview =
      buildingImplementationReview ??
      createImplementationReview(buildingSeed.id)

    const baseResult = createFeatureSeedRunResult({
      featureSeed: buildingSeed,
      content: implementationResult,
      projectStatus: status,
    })
    if (!baseResult) return
    const completionSummary = generateFeatureCompletionSummary({
      featureSeed: buildingSeed,
      implementationReview,
      projectConfig,
      projectStatus: status,
    })
    const result: RunResult = {
      ...baseResult,
      title: `${buildingSeed.title} が完成した`,
      summary: completionSummary.summary,
      changedFiles: completionSummary.changedFiles,
      logs: [
        ...(implementationReview.repositoryDiff
          ? [
              implementationReview.repositoryDiff.error
                ? `差分: 取得失敗 / ${implementationReview.repositoryDiff.error}`
                : `差分: ${implementationReview.repositoryDiff.fileCount}ファイル / +${implementationReview.repositoryDiff.insertions} / -${implementationReview.repositoryDiff.deletions} / リスク ${implementationReview.repositoryDiff.riskLevel}`,
              ...implementationReview.repositoryDiff.changedFiles.map(
                (file) => `変更ファイル: ${file}`,
              ),
            ]
          : ['差分: 未取得']),
        ...completionSummary.verificationSummary.map(
          (item) => `確認: ${item}`,
        ),
        ...completionSummary.concerns.map((item) => `懸念: ${item}`),
        ...completionSummary.recommendations.map(
          (item) => `推奨: ${item}`,
        ),
      ],
      recommendation:
        completionSummary.recommendations[0] ??
        '次は「確かめる」で変更内容を検証しましょう。',
      createdAt: completionSummary.completedAt,
      featureSeedId: buildingSeed.id,
      featureSeedTitle: buildingSeed.title,
    }
    const reviewVerifications = implementationReview.verifications

    const builtSeed: FeatureSeed = {
      ...buildingSeed,
      status: 'built',
      builtAt: completionSummary.completedAt,
      verificationStatus: getFeatureVerificationStatus(
        reviewVerifications,
      ),
      verifications: reviewVerifications,
      completionSummary,
    }
    const builtFeatureSeeds = featureSeeds.map((seed) =>
      seed.id === builtSeed.id ? builtSeed : seed,
    )

    setPromptFeatureSeed(builtSeed)
    setBuildingCopyState('idle')
    setImplementationResult('')
    setAgentRunResult(null)
    setAgentRunStage('idle')
    setVerificationSelectionVisible(false)
    setSelectedVerificationSeedId(null)
    recordRunResult(result, {
      featureSeeds: builtFeatureSeeds,
      latestIdeaOptions: [],
    })
    setGameLoopMessage(
      `「${builtSeed.title}」が完成しました。次は「確かめる」で確認しましょう。`,
    )
  }

  const cancelFeatureSeedBuild = () => {
    const buildingSeed = featureSeeds.find(
      (seed) => seed.status === 'building',
    )
    if (!buildingSeed) return

    const plannedSeed: FeatureSeed = {
      ...buildingSeed,
      status: 'planned',
    }
    const restoredFeatureSeeds = featureSeeds.map((seed) =>
      seed.id === plannedSeed.id ? plannedSeed : seed,
    )
    setFeatureSeeds(restoredFeatureSeeds)
    setPromptFeatureSeed(undefined)
    setBuildingCopyState('idle')
    setImplementationResult('')
    setAgentRunResult(null)
    setAgentRunStage('idle')
    setGameLoopMessage(
      `「${plannedSeed.title}」の実装を中断し、機能の元へ戻しました。`,
    )
    saveAppState({
      projectConfig,
      projectStatus: status,
      runHistory: results,
      selectedResultId: selectedResult?.result.id ?? null,
      featureSeeds: restoredFeatureSeeds,
      latestIdeaOptions,
      contextSummary,
    })
  }

  const discardFeatureSeed = (featureSeed: FeatureSeed) => {
    const currentSeed = featureSeeds.find(
      (seed) => seed.id === featureSeed.id,
    )
    if (!currentSeed || currentSeed.status !== 'planned') {
      setGameLoopMessage(
        '破棄できるのは、まだ実装を始めていない機能の元だけです。',
      )
      return
    }
    if (
      !window.confirm(
        `「${currentSeed.title}」を破棄しますか？ 破棄すると作る対象から外れます。`,
      )
    ) {
      return
    }

    const discardedAt = new Date().toISOString()
    const discardedSeed: FeatureSeed = {
      ...currentSeed,
      status: 'discarded',
      discardedAt,
      discardReason: '',
    }
    const nextFeatureSeeds = featureSeeds.map((seed) =>
      seed.id === discardedSeed.id ? discardedSeed : seed,
    )
    const result: RunResult = {
      id: crypto.randomUUID(),
      turn: status.turn,
      turnAdvanced: false,
      commandType: 'organize',
      title: '機能の元を破棄した',
      summary: `${discardedSeed.title} を破棄しました。`,
      statusChanges: {},
      changedFiles: [],
      logs: [
        `破棄した機能の元: ${discardedSeed.title}`,
        `カテゴリ: ${featureSeedCategoryLabel(discardedSeed.category)}`,
        `難易度: ${featureSeedDifficultyLabel(discardedSeed.difficulty)}`,
      ],
      recommendation:
        '機能の元に空きができました。「考える」で新しい候補を探せます。',
      createdAt: discardedAt,
      featureSeedId: discardedSeed.id,
      featureSeedTitle: discardedSeed.title,
    }

    setBuildSelectionVisible(false)
    recordRunResult(
      result,
      {
        featureSeeds: nextFeatureSeeds,
        latestIdeaOptions,
      },
      false,
    )
    setGameLoopMessage(
      '機能の元に空きができました。次は「考える」で新しい候補を探せます。',
    )
  }

  const selectResult = (entry: RunHistoryEntry) => {
    setSelectedResult(entry)
    saveAppState({
      projectConfig,
      projectStatus: status,
      runHistory: results,
      selectedResultId: entry.result.id,
      featureSeeds,
      latestIdeaOptions,
      contextSummary,
    })
  }

  const resetProject = () => {
    if (
      !window.confirm(
        'プロジェクト状態と実行履歴を削除して、はじめからやり直しますか？',
      )
    ) {
      return
    }

    clearAppState()
    setIsStarted(false)
    setStatus(initialProjectStatus)
    setProjectConfig(initialProjectConfig)
    setConfigDraft(initialProjectConfig)
    setConfigSaved(false)
    setSetupRawInput('')
    setSetupAdditionalAnswer('')
    setSetupDraft(undefined)
    setSetupAssistantMessage('')
    setSetupParseError('')
    setSetupParsing(false)
    setResults([])
    setSelectedResult(null)
    setRunningCommand(null)
    setPastedResult('')
    setGitDiffInput('')
    setVerificationType('test')
    setVerificationCommand(initialProjectConfig.verificationCommands.test)
    setVerificationOutput('')
    setRepositoryStatus(null)
    setRepositoryDiff(null)
    setAutomatedVerification(null)
    setRunningVerificationType(null)
    setFeatureSeeds([])
    setLatestIdeaOptions([])
    setIdeaGenerationInfo(undefined)
    setIdeaGenerationStatus('idle')
    setBuildSelectionVisible(false)
    setPromptFeatureSeed(undefined)
    setImplementationResult('')
    setAgentRunResult(null)
    setAgentRunning(false)
    setAgentRunStage('idle')
    setGameLoopMessage('')
    setContextSummary(undefined)
    setLatestReleaseJudgement(undefined)
    setReleaseJudgements([])
    const resetScenarioConfig = createInitialScenarioConfig(
      initialProjectConfig,
    )
    setScenarioConfig(resetScenarioConfig)
    setScenarioStatus('playing')
    setScenarioResult(undefined)
    setScenarioMaxTurnDraft(resetScenarioConfig.maxTurn)
    setImplementationReviews([])
    saveAppState({
      isStarted: false,
      projectConfig: initialProjectConfig,
      projectStatus: initialProjectStatus,
      runHistory: [],
      selectedResultId: null,
      featureSeeds: [],
      latestIdeaOptions: [],
      contextSummary: undefined,
      latestReleaseJudgement: undefined,
      releaseJudgements: [],
      scenarioConfig: resetScenarioConfig,
      scenarioStatus: 'playing',
      scenarioResult: undefined,
      implementationReviews: [],
    })
  }

  const startProject = (
    sourceConfig = configDraft,
    sourceMaxTurn = scenarioMaxTurnDraft,
  ) => {
    const normalizedConfig: ProjectConfig = {
      ...sourceConfig,
      appName: sourceConfig.appName.trim() || initialProjectConfig.appName,
      productVision: sourceConfig.productVision.trim(),
      targetUser: sourceConfig.targetUser.trim(),
      problemStatement: sourceConfig.problemStatement.trim(),
      initialGoal: sourceConfig.initialGoal.trim(),
      techStack:
        sourceConfig.techStack.trim() || initialProjectConfig.techStack,
      repositoryPath: sourceConfig.repositoryPath.trim(),
      agentCommandConfig: {
        codexCommand:
          sourceConfig.agentCommandConfig.codexCommand.trim() || 'codex',
        codexArgs:
          sourceConfig.agentCommandConfig.codexArgs.trim() ||
          initialProjectConfig.agentCommandConfig.codexArgs,
      },
      agentTimeoutMs: Math.min(
        120_000,
        Math.max(1_000, Math.floor(sourceConfig.agentTimeoutMs || 120_000)),
      ),
    }
    const nextStatus = { ...initialProjectStatus }
    const nextScenarioConfig = createInitialScenarioConfig(
      normalizedConfig,
      sourceMaxTurn,
    )

    setIsStarted(true)
    setProjectConfig(normalizedConfig)
    setConfigDraft(normalizedConfig)
    setStatus(nextStatus)
    setResults([])
    setSelectedResult(null)
    setFeatureSeeds([])
    setLatestIdeaOptions([])
    setIdeaGenerationInfo(undefined)
    setIdeaGenerationStatus('idle')
    setContextSummary(undefined)
    setLatestReleaseJudgement(undefined)
    setReleaseJudgements([])
    setScenarioConfig(nextScenarioConfig)
    setScenarioStatus('playing')
    setScenarioResult(undefined)
    setImplementationReviews([])
    setSetupDraft(undefined)
    setSetupAdditionalAnswer('')
    setSetupAssistantMessage('')
    setSetupParseError('')
    setSetupParsing(false)
    setPromptCommand('think')
    setPromptFeatureSeed(undefined)
    setBuildSelectionVisible(false)
    setVerificationSelectionVisible(false)
    setSelectedVerificationSeedId(null)
    setRepositoryStatus(null)
    setRepositoryDiff(null)
    setAutomatedVerification(null)
    setVerificationType('test')
    setVerificationCommand(normalizedConfig.verificationCommands.test)
    setVerificationOutput('')
    setImplementationResult('')
    setAgentRunResult(null)
    setAgentRunning(false)
    setAgentRunStage('idle')
    setPastedResult('')
    setGitDiffInput('')
    setGameLoopMessage(
      `${normalizedConfig.appName} の開発が始まりました。まずは「考える」で、最初の機能の元を見つけましょう。`,
    )
    clearSetupState()
    saveAppState({
      isStarted: true,
      projectConfig: normalizedConfig,
      projectStatus: nextStatus,
      runHistory: [],
      selectedResultId: null,
      featureSeeds: [],
      latestIdeaOptions: [],
      contextSummary: undefined,
      latestReleaseJudgement: undefined,
      releaseJudgements: [],
      scenarioConfig: nextScenarioConfig,
      scenarioStatus: 'playing',
      scenarioResult: undefined,
      implementationReviews: [],
    })
  }

  const persistSetupState = (
    next: Partial<{
      rawInput: string
      additionalAnswer: string
      draft: ProjectSetupDraft | undefined
      assistantMessage: string
    }> = {},
  ) => {
    saveSetupState({
      rawInput: next.rawInput ?? setupRawInput,
      additionalAnswer:
        next.additionalAnswer ?? setupAdditionalAnswer,
      draft: next.draft === undefined ? setupDraft : next.draft,
      assistantMessage:
        next.assistantMessage ?? setupAssistantMessage,
    })
  }

  const generateSetupDraft = async (input = setupRawInput) => {
    if (!input.trim() || setupParsing) return

    setSetupParsing(true)
    setSetupParseError('')
    try {
      const currentFormValues = setupDraft
        ? applyProjectSetupDraft(
            configDraft,
            scenarioMaxTurnDraft,
            setupDraft,
          ).projectConfig
        : configDraft
      const response = await fetch('/api/setup/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: input,
          currentFormValues,
          scenarioMaxTurn:
            setupDraft?.scenarioMaxTurn ?? scenarioMaxTurnDraft,
        }),
      })
      const data = (await response.json()) as SetupParseResponse
      setSetupAssistantMessage(data.assistantMessage)
      if (!response.ok || !data.success || !data.draft) {
        setSetupParseError(
          data.error ??
            '下書きを生成できませんでした。手動でフォーム入力できます。',
        )
        return
      }
      const editableDraft = createEditableProjectSetupDraft(
        currentFormValues,
        setupDraft?.scenarioMaxTurn ?? scenarioMaxTurnDraft,
        data.draft,
      )
      setSetupDraft(editableDraft)
      setSetupAdditionalAnswer('')
      persistSetupState({
        rawInput: input,
        additionalAnswer: '',
        draft: editableDraft,
        assistantMessage: data.assistantMessage,
      })
    } catch {
      setSetupParseError(
        'AI下書きAPIへ接続できませんでした。手動でフォーム入力できます。',
      )
    } finally {
      setSetupParsing(false)
    }
  }

  const reorganizeSetupDraft = () => {
    if (!setupAdditionalAnswer.trim()) return
    const combinedInput = `${setupRawInput.trim()}\n\n# 追加回答\n${setupAdditionalAnswer.trim()}`
    setSetupRawInput(combinedInput)
    persistSetupState({ rawInput: combinedInput })
    void generateSetupDraft(combinedInput)
  }

  const updateSetupDraft = <Key extends keyof ProjectSetupDraft>(
    key: Key,
    value: ProjectSetupDraft[Key],
  ) => {
    if (!setupDraft) return
    const nextDraft = { ...setupDraft, [key]: value }
    setSetupDraft(nextDraft)
    persistSetupState({ draft: nextDraft })
  }

  const updateSetupDraftVerification = (
    type: VerificationType,
    value: string,
  ) => {
    if (!setupDraft) return
    const nextDraft: ProjectSetupDraft = {
      ...setupDraft,
      verificationCommands: {
        ...initialProjectConfig.verificationCommands,
        ...setupDraft.verificationCommands,
        [type]: value,
      },
    }
    setSetupDraft(nextDraft)
    persistSetupState({ draft: nextDraft })
  }

  const applySetupDraft = () => {
    if (!setupDraft) return

    const applied = applyProjectSetupDraft(
      configDraft,
      scenarioMaxTurnDraft,
      setupDraft,
    )

    setConfigDraft(applied.projectConfig)
    setScenarioMaxTurnDraft(applied.scenarioMaxTurn)
    setConfigSaved(false)
    setSetupAssistantMessage(
      '下書きをフォームへ反映しました。内容を確認・修正してから開始してください。',
    )
    persistSetupState({
      assistantMessage:
        '下書きをフォームへ反映しました。内容を確認・修正してから開始してください。',
    })
  }

  const startFromSetupDraft = () => {
    if (!setupDraft) return
    const applied = applyProjectSetupDraft(
      configDraft,
      scenarioMaxTurnDraft,
      setupDraft,
    )
    startProject(applied.projectConfig, applied.scenarioMaxTurn)
  }

  const formatRunDate = (createdAt: string) =>
    new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(createdAt))

  const buildingFeatureSeed = featureSeeds.find(
    (seed) => seed.status === 'building',
  )
  const buildingImplementationReview = buildingFeatureSeed
    ? getImplementationReview(buildingFeatureSeed.id)
    : undefined
  const updateReviewOperationError = (
    featureSeedId: string,
    key: string,
    message?: string,
  ): ImplementationReview => {
    const currentReview = getImplementationReview(featureSeedId)
    const prefix = `[${key}]`
    const operationErrors = (currentReview.operationErrors ?? []).filter(
      (item) => !item.startsWith(prefix),
    )
    if (message) operationErrors.push(`${prefix} ${message}`)
    return updateImplementationReview(
      featureSeedId,
      { operationErrors },
      currentReview,
    )
  }
  const displayedAgentRun =
    agentRunResult ?? buildingImplementationReview?.agentRun ?? null
  const prompt = buildAgentPrompt({
    projectConfig,
    projectStatus: status,
    commandType: promptCommand,
    featureSeed: promptFeatureSeed,
    recentRunHistory: results,
  })
  const buildingPrompt = buildingFeatureSeed
    ? buildAgentPrompt({
        projectConfig,
        projectStatus: status,
        commandType: 'build',
        featureSeed: buildingFeatureSeed,
        recentRunHistory: results,
      })
    : ''

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const copyBuildingPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildingPrompt)
      setBuildingCopyState('copied')
    } catch {
      setBuildingCopyState('failed')
    }
  }

  const fetchDiffForImplementationReview = async (
    featureSeedId: string,
    baseReview: ImplementationReview,
  ): Promise<ImplementationReview> => {
    const emptyDiff: RepositoryDiff = {
      changedFiles: [],
      nameOnlyText: '',
      statText: '',
      insertions: 0,
      deletions: 0,
      fileCount: 0,
      riskLevel: 'low',
    }

    if (!projectConfig.repositoryPath.trim()) {
      const failedDiff = {
        ...emptyDiff,
        error:
          'リポジトリパスが設定されていません。手動で再取得できます。',
      }
      setRepositoryDiff(failedDiff)
      return updateImplementationReview(
        featureSeedId,
        { repositoryDiff: failedDiff },
        baseReview,
      )
    }

    setRepositoryDiffLoading(true)
    try {
      const response = await fetch(
        `/api/repository/diff?path=${encodeURIComponent(projectConfig.repositoryPath)}`,
      )
      const data = (await response.json()) as RepositoryDiff
      const repositoryDiff =
        response.ok && !data.error
          ? data
          : {
              ...emptyDiff,
              ...data,
              error:
                data.error ??
                'git diffの自動取得に失敗しました。手動で再取得できます。',
            }
      setRepositoryDiff(repositoryDiff)
      return updateImplementationReview(
        featureSeedId,
        { repositoryDiff },
        baseReview,
      )
    } catch {
      const failedDiff = {
        ...emptyDiff,
        error:
          'git diff APIへ接続できませんでした。手動で再取得できます。',
      }
      setRepositoryDiff(failedDiff)
      return updateImplementationReview(
        featureSeedId,
        { repositoryDiff: failedDiff },
        baseReview,
      )
    } finally {
      setRepositoryDiffLoading(false)
    }
  }

  const runBuildingAgent = async () => {
    if (!buildingFeatureSeed || agentRunning) return

    if (
      !isAutoRunAgentKind(projectConfig.defaultAgent) &&
      projectConfig.defaultAgent !== 'manual'
    ) {
      const unsupportedResult: AgentRunResponse = {
        agentKind: projectConfig.defaultAgent,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: `${projectConfig.defaultAgent}の自動実行にはまだ対応していません。`,
      }
      setAgentRunResult(unsupportedResult)
      updateImplementationReview(buildingFeatureSeed.id, {
        agentRun: unsupportedResult,
      })
      return
    }

    setAgentRunning(true)
    setAgentRunStage('agent')
    setAgentRunResult(null)
    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentKind: projectConfig.defaultAgent,
          repositoryPath: projectConfig.repositoryPath,
          prompt: buildingPrompt,
          featureSeedId: buildingFeatureSeed.id,
          codexCommand: projectConfig.agentCommandConfig.codexCommand,
          codexArgs: projectConfig.agentCommandConfig.codexArgs,
          agentTimeoutMs: projectConfig.agentTimeoutMs,
        }),
      })
      const data = (await response.json()) as AgentRunResponse
      setAgentRunResult(data)
      const reviewAfterAgent = updateImplementationReview(
        buildingFeatureSeed.id,
        { agentRun: data },
      )

      const output = [
        data.stdout.trim() ? `stdout:\n${data.stdout.trim()}` : '',
        data.stderr.trim() ? `stderr:\n${data.stderr.trim()}` : '',
        data.error ? `error:\n${data.error}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      // manual は自動実行を行わないため、APIの案内メッセージを実装結果として
      // 扱わない。ユーザー自身の実装結果が貼られるまで完成操作を有効にしない。
      if (output && data.agentKind !== 'manual') {
        setImplementationResult(output)
      }

      setAgentRunStage('diff')
      const reviewAfterDiff = await fetchDiffForImplementationReview(
        buildingFeatureSeed.id,
        reviewAfterAgent,
      )
      setAgentRunStage('review')
      updateImplementationReview(
        buildingFeatureSeed.id,
        {},
        reviewAfterDiff,
      )
      if (data.agentKind === 'manual') {
        setGameLoopMessage(
          '手動実装モードです。プロンプトを外部ツールで実行し、結果を貼り付けてください。git diffは自動取得しました。',
        )
      }
    } catch {
      const failedResult: AgentRunResponse = {
        agentKind: projectConfig.defaultAgent,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: 'AIエージェント実行APIへ接続できませんでした。',
      }
      setAgentRunResult(failedResult)
      const reviewAfterFailure = updateImplementationReview(
        buildingFeatureSeed.id,
        { agentRun: failedResult },
      )
      setAgentRunStage('diff')
      const reviewAfterDiff = await fetchDiffForImplementationReview(
        buildingFeatureSeed.id,
        reviewAfterFailure,
      )
      setAgentRunStage('review')
      updateImplementationReview(
        buildingFeatureSeed.id,
        {},
        reviewAfterDiff,
      )
    } finally {
      setAgentRunning(false)
      setAgentRunStage('idle')
    }
  }

  const importPastedResult = () => {
    const result = parsePastedAgentResult({
      commandType: promptCommand,
      content: pastedResult,
      projectStatus: status,
    })
    if (!result) return

    recordRunResult(result, undefined, false)
    setPastedResult('')
  }

  const mergeStatusChanges = (
    current: StatusChanges,
    added: StatusChanges,
  ): StatusChanges => ({
    completion: (current.completion ?? 0) + (added.completion ?? 0),
    stamina: (current.stamina ?? 0) + (added.stamina ?? 0),
    motivation: (current.motivation ?? 0) + (added.motivation ?? 0),
    technicalDebt:
      (current.technicalDebt ?? 0) + (added.technicalDebt ?? 0),
  })

  const recordGitDiff = (
    gitDiff: GitDiffSummary,
    logs: string[] = [`git diff: ${gitDiff.summaryText}`],
  ) => {
    const actualChanges = getActualStatusChanges(
      status,
      getGitDiffStatusChanges(gitDiff.riskLevel),
    )
    const changedFiles = [
      ...new Set([
        ...(results[0]?.result.changedFiles ?? []),
        ...gitDiff.changedFiles,
      ]),
    ]
    const recommendation = getGitDiffRecommendation(gitDiff.riskLevel)
    const nextStatusWithTurn = applyStatusChanges(status, actualChanges)
    const nextStatus = { ...nextStatusWithTurn, turn: status.turn }

    if (results.length > 0) {
      const latestEntry = results[0]
      const updatedEntry: RunHistoryEntry = {
        ...latestEntry,
        result: {
          ...latestEntry.result,
          summary: `${latestEntry.result.summary} / ${gitDiff.summaryText}`,
          statusChanges: mergeStatusChanges(
            latestEntry.result.statusChanges,
            actualChanges,
          ),
          changedFiles,
          logs: [...latestEntry.result.logs, ...logs],
          recommendation,
          gitDiff,
        },
      }
      const nextResults = [updatedEntry, ...results.slice(1)]

      setStatus(nextStatus)
      setResults(nextResults)
      setSelectedResult(updatedEntry)
      saveAppState({
        projectConfig,
        projectStatus: nextStatus,
        runHistory: nextResults,
        selectedResultId: updatedEntry.result.id,
        featureSeeds,
        latestIdeaOptions,
        contextSummary,
      })
    } else {
      const result: RunResult = {
        id: crypto.randomUUID(),
        turn: status.turn,
        commandType: promptCommand,
        title: 'git diff取り込み結果',
        summary: gitDiff.summaryText,
        statusChanges: actualChanges,
        changedFiles: gitDiff.changedFiles,
        logs,
        recommendation,
        createdAt: new Date().toISOString(),
        gitDiff,
      }
      recordRunResult(result, undefined, false)
    }

  }

  const importGitDiff = () => {
    const gitDiff = parseGitDiffInput(gitDiffInput)
    if (!gitDiff) return

    if (buildingFeatureSeed) {
      updateImplementationReview(buildingFeatureSeed.id, {
        repositoryDiff: {
          changedFiles: gitDiff.changedFiles,
          nameOnlyText: gitDiff.changedFiles.join('\n'),
          statText: gitDiffInput.trim(),
          insertions: gitDiff.insertions,
          deletions: gitDiff.deletions,
          fileCount: gitDiff.fileCount,
          riskLevel: gitDiff.riskLevel,
        },
      })
      setGitDiffInput('')
      setGameLoopMessage(
        'git diffを実装レビューに記録しました。完成時の履歴へまとめて反映します。',
      )
      return
    }
    recordGitDiff(gitDiff)
    setGitDiffInput('')
  }

  const importVerificationResult = () => {
    const targetSeed = featureSeeds.find(
      (seed) =>
        seed.id === selectedVerificationSeedId && seed.status === 'built',
    )
    const result = createVerificationRunResult({
      verificationType,
      command: verificationCommand,
      output: verificationOutput,
      projectStatus: status,
    })
    if (!result?.verification) return

    if (buildingFeatureSeed) {
      const verification: FeatureVerification = {
        verificationType: result.verification.verificationType,
        command: result.verification.command,
        success: result.verification.success,
        checkedAt: result.createdAt,
        summaryText: result.verification.summaryText,
      }
      const currentReview =
        implementationReviews.find(
          (review) => review.featureSeedId === buildingFeatureSeed.id,
        ) ?? createImplementationReview(buildingFeatureSeed.id)
      updateImplementationReview(buildingFeatureSeed.id, {
        verifications: [
          verification,
          ...currentReview.verifications,
        ],
      })
      setVerificationOutput('')
      return
    }

    if (!targetSeed) {
      setGameLoopMessage('先に確認対象の完成済み機能を選んでください。')
      return
    }

    recordFeatureVerification(targetSeed, result)
    setVerificationOutput('')
  }

  const selectVerificationFeatureSeed = (seed: FeatureSeed) => {
    if (seed.status !== 'built') return

    setSelectedVerificationSeedId(seed.id)
    setVerificationSelectionVisible(false)
    setPromptCommand('verify')
    setPromptFeatureSeed(seed)
    setVerificationType('test')
    setVerificationCommand(projectConfig.verificationCommands.test)
    setAutomatedVerification(null)
    setVerificationOutput('')
    setGameLoopMessage(
      `「${seed.title}」を確認します。確認種別を選んで実行結果を記録してください。`,
    )
  }

  const recordFeatureVerification = (
    targetSeed: FeatureSeed,
    result: RunResult,
  ) => {
    if (!result.verification) return

    const verification: FeatureVerification = {
      verificationType: result.verification.verificationType,
      command: result.verification.command,
      success: result.verification.success,
      checkedAt: result.createdAt,
      summaryText: result.verification.summaryText,
      runResultId: result.id,
    }
    const verifications = [
      verification,
      ...(targetSeed.verifications ?? []),
    ]
    const updatedSeed: FeatureSeed = {
      ...targetSeed,
      verificationStatus: getFeatureVerificationStatus(verifications),
      verifications,
    }
    const nextFeatureSeeds = featureSeeds.map((seed) =>
      seed.id === updatedSeed.id ? updatedSeed : seed,
    )
    const linkedResult: RunResult = {
      ...result,
      title: `${targetSeed.title} / ${result.title}`,
      featureSeedId: targetSeed.id,
      featureSeedTitle: targetSeed.title,
    }

    recordRunResult(linkedResult, {
      featureSeeds: nextFeatureSeeds,
      latestIdeaOptions,
    })
    setGameLoopMessage(
      verification.success
        ? `「${targetSeed.title}」の${verification.verificationType}確認に成功しました。`
        : `「${targetSeed.title}」の${verification.verificationType}確認で問題が見つかりました。`,
    )
  }

  const updateConfigDraft = <Key extends keyof ProjectConfig>(
    key: Key,
    value: ProjectConfig[Key],
  ) => {
    setConfigDraft((current) => ({ ...current, [key]: value }))
    setConfigSaved(false)
  }

  const updateVerificationCommand = (
    type: VerificationType,
    value: string,
  ) => {
    setConfigDraft((current) => ({
      ...current,
      verificationCommands: {
        ...current.verificationCommands,
        [type]: value,
      },
    }))
    setConfigSaved(false)
  }

  const updateAgentCommandConfig = (
    key: 'codexCommand' | 'codexArgs',
    value: string,
  ) => {
    setConfigDraft((current) => ({
      ...current,
      agentCommandConfig: {
        ...current.agentCommandConfig,
        [key]: value,
      },
    }))
    setConfigSaved(false)
  }

  // 実行エージェントを切り替えたとき、コマンド/引数が未編集（空または
  // 別エージェントの既定値）なら、新しいエージェントの既定値へ合わせる。
  const handleConfigAgentChange = (kind: AgentKind) => {
    setConfigDraft((current) => ({
      ...current,
      defaultAgent: kind,
      agentCommandConfig: resolveAgentCommandConfig(
        kind,
        current.agentCommandConfig,
      ),
    }))
    setConfigSaved(false)
  }

  // 現在選択中エージェントのCLI仕様（コマンド/引数の入力プレースホルダー用）。
  const activeAgentSpec = isCliAgentKind(configDraft.defaultAgent)
    ? CLI_AGENT_SPECS[configDraft.defaultAgent]
    : undefined

  const saveProjectConfig = () => {
    const normalizedConfig = {
      ...configDraft,
      appName: configDraft.appName.trim() || initialProjectConfig.appName,
      productVision: configDraft.productVision.trim(),
      targetUser: configDraft.targetUser.trim(),
      problemStatement: configDraft.problemStatement.trim(),
      initialGoal: configDraft.initialGoal.trim(),
      techStack:
        configDraft.techStack.trim() || initialProjectConfig.techStack,
      repositoryPath: configDraft.repositoryPath.trim(),
      agentCommandConfig: {
        codexCommand:
          configDraft.agentCommandConfig.codexCommand.trim() || 'codex',
        codexArgs:
          configDraft.agentCommandConfig.codexArgs.trim() ||
          initialProjectConfig.agentCommandConfig.codexArgs,
      },
      agentTimeoutMs: Math.min(
        120_000,
        Math.max(1_000, Math.floor(configDraft.agentTimeoutMs || 120_000)),
      ),
    }
    setProjectConfig(normalizedConfig)
    setConfigDraft(normalizedConfig)
    setVerificationCommand(
      normalizedConfig.verificationCommands[verificationType],
    )
    setConfigSaved(true)
    setRepositoryStatus(null)
    setRepositoryDiff(null)
    setAutomatedVerification(null)
    saveAppState({
      projectConfig: normalizedConfig,
      projectStatus: status,
      runHistory: results,
      selectedResultId: selectedResult?.result.id ?? null,
      featureSeeds,
      latestIdeaOptions,
      contextSummary,
    })
  }

  const checkAgentConnection = async () => {
    setAgentConnectionChecking(true)
    setAgentConnectionResult(null)
    try {
      const response = await fetch('/api/agent/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentKind: configDraft.defaultAgent,
          codexCommand:
            configDraft.agentCommandConfig.codexCommand.trim() ||
            initialProjectConfig.agentCommandConfig.codexCommand,
          codexArgs:
            configDraft.agentCommandConfig.codexArgs.trim() ||
            initialProjectConfig.agentCommandConfig.codexArgs,
        }),
      })
      setAgentConnectionResult(
        (await response.json()) as AgentConnectionResponse,
      )
    } catch {
      setAgentConnectionResult({
        success: false,
        command: configDraft.agentCommandConfig.codexCommand,
        args: configDraft.agentCommandConfig.codexArgs,
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: '疎通確認APIへ接続できませんでした。',
      })
    } finally {
      setAgentConnectionChecking(false)
    }
  }

  const checkRepositoryStatus = async () => {
    if (!projectConfig.repositoryPath.trim()) {
      setRepositoryStatus({
        exists: false,
        isDirectory: false,
        isGitRepository: false,
        changedFiles: [],
        error: 'リポジトリパスが設定されていません。',
      })
      return
    }

    setRepositoryLoading(true)
    try {
      const response = await fetch(
        `/api/repository/status?path=${encodeURIComponent(projectConfig.repositoryPath)}`,
      )
      const data = (await response.json()) as RepositoryStatus
      setRepositoryStatus(data)
    } catch {
      setRepositoryStatus({
        exists: false,
        isDirectory: false,
        isGitRepository: false,
        changedFiles: [],
        error: 'リポジトリ状態の取得に失敗しました。',
      })
    } finally {
      setRepositoryLoading(false)
    }
  }

  const fetchRepositoryDiff = async () => {
    if (!projectConfig.repositoryPath.trim()) {
      const failedDiff: RepositoryDiff = {
        changedFiles: [],
        nameOnlyText: '',
        statText: '',
        insertions: 0,
        deletions: 0,
        fileCount: 0,
        riskLevel: 'low',
        error: 'リポジトリパスが設定されていません。',
      }
      setRepositoryDiff(failedDiff)
      if (buildingFeatureSeed) {
        updateImplementationReview(buildingFeatureSeed.id, {
          repositoryDiff: failedDiff,
        })
      }
      return
    }

    setRepositoryDiffLoading(true)
    try {
      const response = await fetch(
        `/api/repository/diff?path=${encodeURIComponent(projectConfig.repositoryPath)}`,
      )
      const data = (await response.json()) as RepositoryDiff
      setRepositoryDiff(data)
      if (buildingFeatureSeed) {
        updateImplementationReview(buildingFeatureSeed.id, {
          repositoryDiff: data,
        })
      }
    } catch {
      const failedDiff: RepositoryDiff = {
        changedFiles: [],
        nameOnlyText: '',
        statText: '',
        insertions: 0,
        deletions: 0,
        fileCount: 0,
        riskLevel: 'low',
        error: 'git diffの取得に失敗しました。',
      }
      setRepositoryDiff(failedDiff)
      if (buildingFeatureSeed) {
        updateImplementationReview(buildingFeatureSeed.id, {
          repositoryDiff: failedDiff,
        })
      }
    } finally {
      setRepositoryDiffLoading(false)
    }
  }

  const recordRepositoryDiff = () => {
    if (!repositoryDiff || repositoryDiff.error) return

    if (buildingFeatureSeed) {
      updateImplementationReview(buildingFeatureSeed.id, {
        repositoryDiff,
      })
      setGameLoopMessage(
        'この差分は実装レビューに記録済みです。完成時の履歴へまとめて反映します。',
      )
      return
    }

    const gitDiff: GitDiffSummary = {
      changedFiles: repositoryDiff.changedFiles,
      fileCount: repositoryDiff.fileCount,
      insertions: repositoryDiff.insertions,
      deletions: repositoryDiff.deletions,
      riskLevel: repositoryDiff.riskLevel,
      summaryText: `${repositoryDiff.fileCount}ファイル変更 / +${repositoryDiff.insertions} / -${repositoryDiff.deletions} / リスク ${repositoryDiff.riskLevel}`,
    }
    const logs = [
      `git diff --name-only: ${repositoryDiff.nameOnlyText || '変更なし'}`,
      `git diff --stat: ${repositoryDiff.statText || '変更なし'}`,
    ]

    recordGitDiff(gitDiff, logs)
  }

  const runAutomatedVerification = async (type: VerificationType) => {
    const targetSeed = featureSeeds.find(
      (seed) =>
        seed.id === selectedVerificationSeedId && seed.status === 'built',
    )
    if (!targetSeed && !buildingFeatureSeed) {
      setGameLoopMessage('先に確認対象の完成済み機能を選んでください。')
      return
    }

    const command = projectConfig.verificationCommands[type].trim()
    setVerificationType(type)
    setVerificationCommand(command)

    if (!projectConfig.repositoryPath.trim() || !command) {
      const error = !projectConfig.repositoryPath.trim()
        ? 'リポジトリパスが設定されていません。'
        : `${type}コマンドが設定されていません。`
      setAutomatedVerification({
        verificationType: type,
        command,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        summaryText: '確認コマンドを実行できませんでした。',
        errorCount: 0,
        warningCount: 0,
        riskLevel: 'medium',
        error,
      })
      if (buildingFeatureSeed) {
        updateReviewOperationError(
          buildingFeatureSeed.id,
          `verification:${type}`,
          `${type}を実行できませんでした: ${error}`,
        )
      }
      return
    }

    setRunningVerificationType(type)
    setAutomatedVerification(null)
    try {
      const response = await fetch('/api/repository/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: projectConfig.repositoryPath,
          verificationType: type,
          command,
        }),
      })
      const data = (await response.json()) as
        | VerifyRepositoryResponse
        | { error?: string }

      if (!response.ok || !('verificationType' in data)) {
        const error = data.error || '確認コマンドの実行に失敗しました。'
        setAutomatedVerification({
          verificationType: type,
          command,
          success: false,
          exitCode: null,
          stdout: '',
          stderr: '',
          durationMs: 0,
          summaryText: '確認コマンドを実行できませんでした。',
          errorCount: 0,
          warningCount: 0,
          riskLevel: 'medium',
          error,
        })
        if (buildingFeatureSeed) {
          updateReviewOperationError(
            buildingFeatureSeed.id,
            `verification:${type}`,
            `${type}を実行できませんでした: ${error}`,
          )
        }
        return
      }

      setAutomatedVerification(data)
      if (buildingFeatureSeed) {
        const currentReview = updateReviewOperationError(
          buildingFeatureSeed.id,
          `verification:${type}`,
        )
        const verification: FeatureVerification = {
          verificationType: data.verificationType,
          command: data.command,
          success: data.success,
          checkedAt: new Date().toISOString(),
          summaryText: data.summaryText,
        }
        updateImplementationReview(buildingFeatureSeed.id, {
          verifications: [
            verification,
            ...currentReview.verifications,
          ],
        })
      }
    } catch {
      const error = '確認APIへの接続に失敗しました。'
      setAutomatedVerification({
        verificationType: type,
        command,
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        summaryText: '確認コマンドを実行できませんでした。',
        errorCount: 0,
        warningCount: 0,
        riskLevel: 'medium',
        error,
      })
      if (buildingFeatureSeed) {
        updateReviewOperationError(
          buildingFeatureSeed.id,
          `verification:${type}`,
          `${type}を実行できませんでした: ${error}`,
        )
      }
    } finally {
      setRunningVerificationType(null)
    }
  }

  const recordAutomatedVerification = () => {
    if (!automatedVerification || automatedVerification.durationMs === 0) {
      return
    }

    const logs = [
      `command: ${automatedVerification.command}`,
      `exit code: ${automatedVerification.exitCode ?? 'none'}`,
      `duration: ${automatedVerification.durationMs}ms`,
      ...[automatedVerification.stdout, automatedVerification.stderr]
        .filter(Boolean)
        .flatMap((output) => output.split(/\r?\n/).filter(Boolean)),
    ]
    const targetSeed = featureSeeds.find(
      (seed) =>
        seed.id === selectedVerificationSeedId && seed.status === 'built',
    )
    if (buildingFeatureSeed) {
      return
    }
    if (!targetSeed) {
      setGameLoopMessage('先に確認対象の完成済み機能を選んでください。')
      return
    }

    const parsed: ParsedVerificationResult = {
      verificationType: automatedVerification.verificationType,
      command: automatedVerification.command,
      success: automatedVerification.success,
      summaryText: automatedVerification.summaryText,
      errorCount: automatedVerification.errorCount,
      warningCount: automatedVerification.warningCount,
      riskLevel: automatedVerification.riskLevel,
      logs,
    }

    recordFeatureVerification(
      targetSeed,
      createVerificationRunResultFromParsed(parsed, status),
    )
  }

  const judgeReleaseReadiness = () => {
    const nextTurn = status.turn + 1
    const judgement = evaluateReleaseReadiness({
      projectStatus: status,
      projectConfig,
      featureSeeds,
      runHistory: results,
      contextSummary,
      turn: nextTurn,
    })
    const nextJudgements = [judgement, ...releaseJudgements]
    const result: RunResult = {
      id: crypto.randomUUID(),
      turn: nextTurn,
      commandType: 'release',
      title: 'リリース判定を行った',
      summary: judgement.summary,
      statusChanges: {},
      changedFiles: [],
      logs: [
        ...judgement.strengths.map((item) => `強み: ${item}`),
        ...judgement.concerns.map((item) => `懸念: ${item}`),
        ...judgement.recommendations.map((item) => `推奨: ${item}`),
      ],
      recommendation:
        judgement.recommendations[0] ??
        '最終確認を行い、リリース手順へ進みましょう。',
      createdAt: judgement.createdAt,
    }

    setLatestReleaseJudgement(judgement)
    setReleaseJudgements(nextJudgements)
    setGameLoopMessage(
      `リリース判定はランク${judgement.rank}でした。第${nextTurn}ターンへ。`,
    )
    recordRunResult(result, {
      featureSeeds,
      latestIdeaOptions,
      contextSummary,
      latestReleaseJudgement: judgement,
      releaseJudgements: nextJudgements,
    })
  }

  const completeScenario = () => {
    if (scenarioStatus === 'completed') return

    const judgement = evaluateReleaseReadiness({
      projectStatus: status,
      projectConfig,
      featureSeeds,
      runHistory: results,
      contextSummary,
      turn: status.turn,
    })
    const completedAt = judgement.createdAt
    const nextScenarioResult: ScenarioResult = {
      completedAt,
      finalTurn: status.turn,
      releaseJudgementId: judgement.id,
      rank: judgement.rank,
      summary: judgement.summary,
    }
    const nextJudgements = [judgement, ...releaseJudgements]
    const result: RunResult = {
      id: crypto.randomUUID(),
      turn: status.turn,
      turnAdvanced: false,
      commandType: 'release',
      title: '最終リリース判定を行った',
      summary: judgement.summary,
      statusChanges: {},
      changedFiles: [],
      logs: [
        `rank: ${judgement.rank}`,
        `score: ${judgement.score}`,
        ...judgement.strengths.map((item) => `強み: ${item}`),
        ...judgement.concerns.map((item) => `懸念: ${item}`),
        ...judgement.recommendations.map((item) => `推奨: ${item}`),
      ],
      recommendation:
        judgement.recommendations[0] ??
        '判定結果を振り返り、次のシナリオへ進みましょう。',
      createdAt: completedAt,
    }
    const entry: RunHistoryEntry = {
      result,
      turn: status.turn,
      motivationBefore: status.motivation,
    }
    const nextResults = [entry, ...results]

    setLatestReleaseJudgement(judgement)
    setReleaseJudgements(nextJudgements)
    setScenarioStatus('completed')
    setScenarioResult(nextScenarioResult)
    setResults(nextResults)
    setSelectedResult(entry)
    setBuildSelectionVisible(false)
    setVerificationSelectionVisible(false)
    setLatestIdeaOptions([])
    setGameLoopMessage('')
    saveAppState({
      projectConfig,
      projectStatus: status,
      runHistory: nextResults,
      selectedResultId: result.id,
      featureSeeds,
      latestIdeaOptions: [],
      contextSummary,
      latestReleaseJudgement: judgement,
      releaseJudgements: nextJudgements,
      scenarioConfig,
      scenarioStatus: 'completed',
      scenarioResult: nextScenarioResult,
    })
  }

  const createDebugState = (
    overrides: Partial<PersistedAppState> = {},
  ): PersistedAppState => ({
    version: STORAGE_VERSION,
    isStarted,
    projectConfig,
    projectStatus: status,
    runHistory: results,
    selectedResultId: selectedResult?.result.id ?? null,
    featureSeeds,
    latestIdeaOptions,
    ideaGenerationInfo,
    contextSummary,
    latestReleaseJudgement,
    releaseJudgements,
    scenarioConfig,
    scenarioStatus,
    scenarioResult,
    implementationReviews,
    ...overrides,
  })

  const persistDebugState = (nextState: PersistedAppState) => {
    saveAppState({
      isStarted: nextState.isStarted,
      projectConfig: nextState.projectConfig,
      projectStatus: nextState.projectStatus,
      runHistory: nextState.runHistory,
      selectedResultId: nextState.selectedResultId,
      featureSeeds: nextState.featureSeeds,
      latestIdeaOptions: nextState.latestIdeaOptions,
      ideaGenerationInfo: nextState.ideaGenerationInfo,
      contextSummary: nextState.contextSummary,
      latestReleaseJudgement: nextState.latestReleaseJudgement,
      releaseJudgements: nextState.releaseJudgements,
      scenarioConfig: nextState.scenarioConfig,
      scenarioStatus: nextState.scenarioStatus,
      scenarioResult: nextState.scenarioResult,
      implementationReviews: nextState.implementationReviews,
    })
  }

  const importDebugState = (serialized: string): string | undefined => {
    const imported = importAppState(serialized)
    if (!imported.state) return imported.error ?? '状態を復元できませんでした。'
    const next = imported.state
    setIsStarted(next.isStarted)
    setProjectConfig(next.projectConfig)
    setConfigDraft(next.projectConfig)
    setStatus(next.projectStatus)
    setResults(next.runHistory)
    setSelectedResult(
      next.runHistory.find(
        (entry) => entry.result.id === next.selectedResultId,
      ) ??
        next.runHistory[0] ??
        null,
    )
    setFeatureSeeds(next.featureSeeds)
    setLatestIdeaOptions(next.latestIdeaOptions)
    setIdeaGenerationInfo(next.ideaGenerationInfo)
    setIdeaGenerationStatus(next.ideaGenerationInfo?.source ?? 'idle')
    setContextSummary(next.contextSummary)
    setLatestReleaseJudgement(next.latestReleaseJudgement)
    setReleaseJudgements(next.releaseJudgements)
    setScenarioConfig(next.scenarioConfig)
    setScenarioMaxTurnDraft(next.scenarioConfig.maxTurn)
    setScenarioStatus(next.scenarioStatus)
    setScenarioResult(next.scenarioResult)
    setImplementationReviews(next.implementationReviews)
    const nextBuildingSeed = next.featureSeeds.find(
      (seed) => seed.status === 'building',
    )
    setPromptFeatureSeed(nextBuildingSeed)
    setPromptCommand(nextBuildingSeed ? 'build' : 'think')
    setSelectedVerificationSeedId(null)
    setBuildSelectionVisible(false)
    setVerificationSelectionVisible(false)
    setPlayScene('camp')
    setGameLoopMessage('Debug Panelから状態を復元しました。')
    return undefined
  }

  const confirmDebugReset = (label: string): boolean =>
    window.confirm(`${label}をリセットしますか？ この操作は元に戻せません。`)

  const resetDebugFeatureSeeds = () => {
    if (!confirmDebugReset('FeatureSeeds')) return
    setFeatureSeeds([])
    setLatestIdeaOptions([])
    setPromptFeatureSeed(undefined)
    persistDebugState(
      createDebugState({
        featureSeeds: [],
        latestIdeaOptions: [],
      }),
    )
  }

  const resetDebugImplementationReviews = () => {
    if (!confirmDebugReset('ImplementationReviews')) return
    setImplementationReviews([])
    persistDebugState(createDebugState({ implementationReviews: [] }))
  }

  const resetDebugRunHistory = () => {
    if (!confirmDebugReset('RunHistory')) return
    setResults([])
    setSelectedResult(null)
    persistDebugState(
      createDebugState({ runHistory: [], selectedResultId: null }),
    )
  }

  const resetDebugContextSummary = () => {
    if (!confirmDebugReset('ContextSummary')) return
    setContextSummary(undefined)
    persistDebugState(createDebugState({ contextSummary: undefined }))
  }

  const resetDebugReleaseJudgements = () => {
    if (!confirmDebugReset('ReleaseJudgements')) return
    setLatestReleaseJudgement(undefined)
    setReleaseJudgements([])
    persistDebugState(
      createDebugState({
        latestReleaseJudgement: undefined,
        releaseJudgements: [],
      }),
    )
  }

  const debugAdvanceTurn = () => {
    const nextStatus = { ...status, turn: status.turn + 1 }
    setStatus(nextStatus)
    persistDebugState(createDebugState({ projectStatus: nextStatus }))
  }

  const debugRestoreStamina = () => {
    const nextStatus = { ...status, stamina: 100 }
    setStatus(nextStatus)
    persistDebugState(createDebugState({ projectStatus: nextStatus }))
  }

  const debugClearTechnicalDebt = () => {
    const nextStatus = { ...status, technicalDebt: 0 }
    setStatus(nextStatus)
    persistDebugState(createDebugState({ projectStatus: nextStatus }))
  }

  const debugAddDummyFeatureSeed = () => {
    if (featureSeeds.filter((seed) => seed.status === 'planned').length >= 3) {
      setGameLoopMessage('planned FeatureSeedが3件あるため追加できません。')
      return
    }
    const dummySeed: FeatureSeed = {
      id: `debug-seed-${crypto.randomUUID()}`,
      title: `Debug用の機能 ${status.turn}`,
      description: 'Debug Panelから追加されたプレイテスト用FeatureSeedです。',
      expectedImpact: 'FeatureSeedを使う画面の動作確認ができます。',
      implementationHint: 'プレイテスト用のため実装内容は任意です。',
      risk: '開発用データです。',
      category: 'developer-experience',
      difficulty: 'small',
      effects: {
        completion: 3,
        technicalDebt: 0,
        stamina: -5,
        motivation: 0,
      },
      status: 'planned',
      createdTurn: status.turn,
      selectedAt: new Date().toISOString(),
    }
    const nextSeeds = [dummySeed, ...featureSeeds]
    setFeatureSeeds(nextSeeds)
    persistDebugState(createDebugState({ featureSeeds: nextSeeds }))
  }

  const debugResumeScenario = () => {
    setScenarioStatus('playing')
    setScenarioResult(undefined)
    persistDebugState(
      createDebugState({
        scenarioStatus: 'playing',
        scenarioResult: undefined,
      }),
    )
  }

  const debugState = createDebugState()
  const debugPanel = (
    <DebugPanel
      state={debugState}
      onImport={importDebugState}
      onResetFeatureSeeds={resetDebugFeatureSeeds}
      onResetImplementationReviews={resetDebugImplementationReviews}
      onResetRunHistory={resetDebugRunHistory}
      onResetContextSummary={resetDebugContextSummary}
      onResetReleaseJudgements={resetDebugReleaseJudgements}
      onFullReset={resetProject}
      onAdvanceTurn={debugAdvanceTurn}
      onRestoreStamina={debugRestoreStamina}
      onClearTechnicalDebt={debugClearTechnicalDebt}
      onAddDummyFeatureSeed={debugAddDummyFeatureSeed}
      onResumeScenario={debugResumeScenario}
    />
  )

  const plannedFeatureSeeds = featureSeeds.filter(
    (seed) => seed.status === 'planned',
  )
  const completedFeatureSeeds = featureSeeds.filter(
    (seed) => seed.status === 'built' || seed.status === 'discarded',
  )
  const builtFeatureSeeds = featureSeeds.filter(
    (seed) => seed.status === 'built',
  )
  const selectedVerificationSeed = builtFeatureSeeds.find(
    (seed) => seed.id === selectedVerificationSeedId,
  )
  const hasVerificationTarget =
    Boolean(selectedVerificationSeed) || Boolean(buildingFeatureSeed)
  const hasFailedRecommendedVerification =
    buildingImplementationReview?.recommendedVerifications?.some(
      (verification) => verification.status === 'failed',
    ) ?? false
  const hasPendingHighVerification =
    buildingImplementationReview?.recommendedVerifications?.some(
      (verification) =>
        verification.priority === 'high' &&
        verification.status === 'not-run',
    ) ?? false
  const remainingTurns = Math.max(0, scenarioConfig.maxTurn - status.turn)
  const isOvertime = status.turn > scenarioConfig.maxTurn
  const finalJudgement =
    releaseJudgements.find(
      (judgement) =>
        judgement.id === scenarioResult?.releaseJudgementId,
    ) ?? latestReleaseJudgement

  if (!isStarted) {
    const requiredSetupFields = [
      ['appName', 'アプリ名', configDraft.appName],
      ['productVision', 'プロダクトビジョン', configDraft.productVision],
      ['initialGoal', '最初のゴール', configDraft.initialGoal],
      ['techStack', '技術スタック', configDraft.techStack],
    ] as const
    const missingSetupFields = requiredSetupFields
      .filter(([, , value]) => !value.trim())
      .map(([, label]) => label)
    const canStart = missingSetupFields.length === 0
    const appliedSetupDraft = setupDraft
      ? applyProjectSetupDraft(
          configDraft,
          scenarioMaxTurnDraft,
          setupDraft,
        )
      : undefined
    const missingDraftFields = appliedSetupDraft
      ? [
          ['アプリ名', appliedSetupDraft.projectConfig.appName],
          [
            'プロダクトビジョン',
            appliedSetupDraft.projectConfig.productVision,
          ],
          ['最初のゴール', appliedSetupDraft.projectConfig.initialGoal],
          ['技術スタック', appliedSetupDraft.projectConfig.techStack],
        ]
          .filter(([, value]) => !value.trim())
          .map(([label]) => label)
      : []
    const canStartFromDraft =
      Boolean(appliedSetupDraft) && missingDraftFields.length === 0

    return (
      <main className="start-shell">
        <div className="ambient ambient--one" />
        <div className="ambient ambient--two" />
        <header className="start-header">
          <div className="brand">
            <span className="brand-mark">DS</span>
            <span>
              <strong>DEV CAMP</strong>
              <small>NEW PROJECT GAME</small>
            </span>
          </div>
          <span>じぶんだけの開発キャンプ</span>
        </header>

        <section className="start-hero">
          <p className="eyebrow">NEW DEV CAMP</p>
          <h1>どんなアプリを育てる？</h1>
          <p>
            名前と目標を決めたら開発スタート！
            あとは毎ターン、コマンドを選んでアプリを育てていこう。
          </p>
        </section>

        <section className="start-card">
          <div className="start-card-heading">
            <div>
              <span>PROJECT PROFILE</span>
              <h2>はじめの設定を決めよう</h2>
            </div>
            <small>最初に決めるのはここだけ！</small>
          </div>

          <details className="setup-assistant">
            <summary>
              <span>AI SETUP ASSIST</span>
              <strong>AIに下書きを作ってもらう</strong>
              <small>任意</small>
            </summary>
            <div className="setup-assistant-body">
              <p>
                作りたいものを、長文・箇条書き・雑なメモのまま入力できます。
                AIはフォームの下書きを作るだけで、プロジェクトを開始しません。
              </p>
              <label>
                <span>作りたいもののメモ</span>
                <textarea
                  value={setupRawInput}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setSetupRawInput(nextValue)
                    persistSetupState({ rawInput: nextValue })
                  }}
                  placeholder={
                    '例:\n・個人開発者向け\n・AIに次の作業を提案してほしい\n・まずはローカルで動くMVP\n・ReactとTypeScriptを使いたい'
                  }
                  rows={7}
                />
              </label>
              <button
                type="button"
                onClick={() => void generateSetupDraft()}
                disabled={setupParsing || !setupRawInput.trim()}
              >
                {setupParsing ? '下書きを生成中…' : '下書きを生成'}
              </button>
              {setupParseError && (
                <div className="setup-assistant-error" role="alert">
                  <strong>下書きを生成できませんでした</strong>
                  <p>{setupParseError}</p>
                  <small>既存フォームは変更していません。手動で入力できます。</small>
                </div>
              )}
              {setupDraft && (
                <div className="setup-draft-preview setup-draft-editor">
                  <div>
                    <span>AI DRAFT</span>
                    <strong>下書きを確認・編集</strong>
                    <small>
                      信頼度 {Math.round(setupDraft.confidence * 100)}%
                    </small>
                  </div>
                  {setupAssistantMessage && <p>{setupAssistantMessage}</p>}
                  <p className="setup-required-guide">
                    必須: アプリ名 / プロダクトビジョン / 最初のゴール /
                    技術スタック
                  </p>
                  <div className="setup-draft-form">
                    <label>
                      <span>アプリ名 *</span>
                      <input
                        value={setupDraft.appName ?? ''}
                        onChange={(event) =>
                          updateSetupDraft('appName', event.target.value)
                        }
                      />
                    </label>
                    <label className="start-wide">
                      <span>プロダクトビジョン *</span>
                      <textarea
                        value={setupDraft.productVision ?? ''}
                        onChange={(event) =>
                          updateSetupDraft(
                            'productVision',
                            event.target.value,
                          )
                        }
                        rows={3}
                      />
                    </label>
                    <label>
                      <span>対象ユーザー</span>
                      <input
                        value={setupDraft.targetUser ?? ''}
                        onChange={(event) =>
                          updateSetupDraft('targetUser', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>最初のゴール *</span>
                      <input
                        value={setupDraft.initialGoal ?? ''}
                        onChange={(event) =>
                          updateSetupDraft('initialGoal', event.target.value)
                        }
                      />
                    </label>
                    <label className="start-wide">
                      <span>解決したい課題</span>
                      <textarea
                        value={setupDraft.problemStatement ?? ''}
                        onChange={(event) =>
                          updateSetupDraft(
                            'problemStatement',
                            event.target.value,
                          )
                        }
                        rows={3}
                      />
                    </label>
                    <label>
                      <span>技術スタック *</span>
                      <input
                        value={setupDraft.techStack ?? ''}
                        onChange={(event) =>
                          updateSetupDraft('techStack', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>リポジトリパス</span>
                      <input
                        value={setupDraft.repositoryPath ?? ''}
                        onChange={(event) =>
                          updateSetupDraft(
                            'repositoryPath',
                            event.target.value,
                          )
                        }
                        placeholder="/path/to/repository"
                      />
                    </label>
                    <label>
                      <span>パッケージマネージャ</span>
                      <select
                        value={setupDraft.packageManager ?? 'pnpm'}
                        onChange={(event) =>
                          updateSetupDraft(
                            'packageManager',
                            event.target.value as PackageManager,
                          )
                        }
                      >
                        {['npm', 'pnpm', 'yarn', 'bun', 'other'].map(
                          (item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      <span>実行エージェント</span>
                      <select
                        value={setupDraft.defaultAgent ?? 'codex'}
                        onChange={(event) =>
                          updateSetupDraft(
                            'defaultAgent',
                            event.target.value as AgentKind,
                          )
                        }
                      >
                        {SELECTABLE_AGENT_KINDS.map((item) => (
                          <option key={item} value={item}>
                            {getAgentLabel(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>開発スタイル</span>
                      <select
                        value={setupDraft.developmentStyle ?? 'safe'}
                        onChange={(event) =>
                          updateSetupDraft(
                            'developmentStyle',
                            event.target.value as DevelopmentStyle,
                          )
                        }
                      >
                        <option value="safe">安全重視</option>
                        <option value="fast">スピード重視</option>
                        <option value="experimental">実験重視</option>
                        <option value="quality-focused">品質重視</option>
                      </select>
                    </label>
                    <label>
                      <span>シナリオ期間</span>
                      <select
                        value={setupDraft.scenarioMaxTurn ?? 12}
                        onChange={(event) =>
                          updateSetupDraft(
                            'scenarioMaxTurn',
                            Number(event.target.value),
                          )
                        }
                      >
                        <option value={8}>8ターン: 小さな試作</option>
                        <option value={12}>12ターン: MVP</option>
                        <option value={24}>24ターン: しっかり開発</option>
                      </select>
                    </label>
                    <div className="start-verification start-wide">
                      <span>確認コマンド</span>
                      <div>
                        {verificationTypes.map((type) => (
                          <label key={type}>
                            <span>{type}</span>
                            <input
                              value={
                                setupDraft.verificationCommands?.[type] ??
                                initialProjectConfig.verificationCommands[type]
                              }
                              onChange={(event) =>
                                updateSetupDraftVerification(
                                  type,
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  {setupDraft.assumptions.length > 0 && (
                    <div className="setup-draft-notes">
                      <strong>AIの仮定</strong>
                      <ul>
                        {setupDraft.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {setupDraft.questions.length > 0 && (
                    <div className="setup-draft-notes">
                      <strong>追加で確認したいこと</strong>
                      <ul>
                        {setupDraft.questions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!setupDraft.repositoryPath && (
                    <p className="setup-assistant-note">
                      エージェント実行やgit diff取得には、後でリポジトリパス設定が必要です。
                    </p>
                  )}
                  <div className="setup-reorganize">
                    <label>
                      <span>追加回答</span>
                      <textarea
                        value={setupAdditionalAnswer}
                        onChange={(event) => {
                          const nextValue = event.target.value
                          setSetupAdditionalAnswer(nextValue)
                          persistSetupState({
                            additionalAnswer: nextValue,
                          })
                        }}
                        placeholder="AIの質問への回答や、追加で伝えたい条件"
                        rows={3}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={reorganizeSetupDraft}
                      disabled={
                        setupParsing || !setupAdditionalAnswer.trim()
                      }
                    >
                      {setupParsing
                        ? '再整理中…'
                        : '回答して再整理'}
                    </button>
                  </div>
                  {missingDraftFields.length > 0 && (
                    <p className="setup-missing-fields" role="status">
                      開始に必要: {missingDraftFields.join(' / ')}
                    </p>
                  )}
                  <div className="setup-draft-actions">
                    <button type="button" onClick={applySetupDraft}>
                      通常フォームにも反映
                    </button>
                    <button
                      type="button"
                      onClick={startFromSetupDraft}
                      disabled={!canStartFromDraft}
                    >
                      サクセス開始
                    </button>
                  </div>
                </div>
              )}
              {!setupDraft && setupAssistantMessage && (
                <p>{setupAssistantMessage}</p>
              )}
            </div>
          </details>

          <div className="setup-workspace">
            <nav className="setup-sidebar" aria-label="初期設定メニュー">
              {([
                ['basic', '基本情報'],
                ['vision', 'プロダクト構想'],
                ['environment', '開発環境'],
                ['agent', 'AIエージェント'],
                ['verification', '確認コマンド'],
                ['scenario', 'シナリオ'],
                ['confirm', '開始確認'],
              ] as const).map(([section, label], index) => (
                <button
                  key={section}
                  type="button"
                  className={setupSection === section ? 'is-active' : ''}
                  onClick={() => setSetupSection(section)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {label}
                </button>
              ))}
            </nav>
          <div
            className={`start-form setup-content-panel setup-active-${setupSection}`}
          >
            <label data-setup-section="basic">
              <span>アプリ名 *</span>
              <input
                value={configDraft.appName}
                onChange={(event) =>
                  updateConfigDraft('appName', event.target.value)
                }
                placeholder="例: Dev Success"
              />
            </label>
            <label className="start-wide" data-setup-section="vision">
              <span>プロダクトビジョン *</span>
              <textarea
                value={configDraft.productVision}
                onChange={(event) =>
                  updateConfigDraft('productVision', event.target.value)
                }
                placeholder="このアプリが実現したい未来"
                rows={3}
              />
            </label>
            <label data-setup-section="vision">
              <span>対象ユーザー</span>
              <input
                value={configDraft.targetUser}
                onChange={(event) =>
                  updateConfigDraft('targetUser', event.target.value)
                }
                placeholder="例: AIを使って開発する個人開発者"
              />
            </label>
            <label data-setup-section="vision">
              <span>最初のゴール *</span>
              <input
                value={configDraft.initialGoal}
                onChange={(event) =>
                  updateConfigDraft('initialGoal', event.target.value)
                }
                placeholder="例: 開発ループを一周できる"
              />
            </label>
            <label className="start-wide" data-setup-section="vision">
              <span>解決したい課題</span>
              <textarea
                value={configDraft.problemStatement}
                onChange={(event) =>
                  updateConfigDraft('problemStatement', event.target.value)
                }
                placeholder="誰が、何に困っているか"
                rows={3}
              />
            </label>
            <label data-setup-section="environment">
              <span>技術スタック *</span>
              <input
                value={configDraft.techStack}
                onChange={(event) =>
                  updateConfigDraft('techStack', event.target.value)
                }
              />
            </label>
            <label data-setup-section="environment">
              <span>リポジトリパス</span>
              <input
                value={configDraft.repositoryPath}
                onChange={(event) =>
                  updateConfigDraft('repositoryPath', event.target.value)
                }
                placeholder="/path/to/repository"
              />
            </label>
            <label data-setup-section="environment">
              <span>パッケージマネージャ</span>
              <select
                value={configDraft.packageManager}
                onChange={(event) =>
                  updateConfigDraft(
                    'packageManager',
                    event.target.value as PackageManager,
                  )
                }
              >
                {['npm', 'pnpm', 'yarn', 'bun', 'other'].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label data-setup-section="agent">
              <span>実行エージェント</span>
              <select
                value={configDraft.defaultAgent}
                onChange={(event) =>
                  handleConfigAgentChange(event.target.value as AgentKind)
                }
              >
                {SELECTABLE_AGENT_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {getAgentLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label data-setup-section="agent">
              <span>開発スタイル</span>
              <select
                value={configDraft.developmentStyle}
                onChange={(event) =>
                  updateConfigDraft(
                    'developmentStyle',
                    event.target.value as DevelopmentStyle,
                  )
                }
              >
                <option value="safe">安全重視</option>
                <option value="fast">スピード重視</option>
                <option value="experimental">実験重視</option>
                <option value="quality-focused">品質重視</option>
              </select>
            </label>
            <label data-setup-section="agent">
              <span>エージェントコマンド</span>
              <input
                value={configDraft.agentCommandConfig.codexCommand}
                onChange={(event) =>
                  updateAgentCommandConfig(
                    'codexCommand',
                    event.target.value,
                  )
                }
                placeholder={activeAgentSpec?.defaultCommand ?? 'codex'}
              />
            </label>
            <label data-setup-section="agent">
              <span>エージェント引数</span>
              <input
                value={configDraft.agentCommandConfig.codexArgs}
                onChange={(event) =>
                  updateAgentCommandConfig('codexArgs', event.target.value)
                }
                placeholder={activeAgentSpec?.argsPlaceholder ?? '例: exec -'}
              />
            </label>
            <label data-setup-section="agent">
              <span>Agentタイムアウト（ms）</span>
              <input
                type="number"
                min={1_000}
                max={120_000}
                step={1_000}
                value={configDraft.agentTimeoutMs}
                onChange={(event) =>
                  updateConfigDraft(
                    'agentTimeoutMs',
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <div data-setup-section="agent">
              <AgentConnectionCheck
                checking={agentConnectionChecking}
                result={agentConnectionResult}
                onCheck={() => void checkAgentConnection()}
              />
            </div>
            <label data-setup-section="scenario">
              <span>シナリオ期間</span>
              <select
                value={scenarioMaxTurnDraft}
                onChange={(event) =>
                  setScenarioMaxTurnDraft(Number(event.target.value))
                }
              >
                {![8, 12, 24].includes(scenarioMaxTurnDraft) && (
                  <option value={scenarioMaxTurnDraft}>
                    {scenarioMaxTurnDraft}ターン: AI提案
                  </option>
                )}
                <option value={8}>8ターン: 小さな試作</option>
                <option value={12}>12ターン: MVP</option>
                <option value={24}>24ターン: しっかり開発</option>
              </select>
            </label>
            <div
              className="start-verification start-wide"
              data-setup-section="verification"
            >
              <span>確認コマンド</span>
              <div>
                {verificationTypes.map((type) => (
                  <label key={type}>
                    <span>{type}</span>
                    <input
                      value={configDraft.verificationCommands[type]}
                      onChange={(event) =>
                        updateVerificationCommand(type, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
          </div>

          {setupSection === 'confirm' && (
            <div className="setup-start-confirm">
              <strong>{configDraft.appName || '名称未設定のアプリ'}</strong>
              <p>{configDraft.initialGoal || '最初のゴールが未設定です。'}</p>
              {missingSetupFields.length > 0 && (
                <p className="setup-missing-fields" role="status">
                  開始に必要: {missingSetupFields.join(' / ')}
                </p>
              )}
              {!configDraft.repositoryPath.trim() && (
                <p className="setup-assistant-note">
                  エージェント実行やgit diff取得には、後でリポジトリパス設定が必要です。
                </p>
              )}
              <button
                className="start-button"
                type="button"
                onClick={() => startProject()}
                disabled={!canStart}
              >
                サクセス開始
              </button>
            </div>
          )}
        </section>
        {debugPanel}
      </main>
    )
  }

  if (scenarioStatus === 'completed' && scenarioResult) {
    const passedCount = builtFeatureSeeds.filter(
      (seed) => seed.verificationStatus === 'passed',
    ).length
    const failedCount = builtFeatureSeeds.filter(
      (seed) => seed.verificationStatus === 'failed',
    ).length
    const pendingCount = builtFeatureSeeds.length - passedCount - failedCount

    return (
      <main className="scenario-complete-shell">
        <div className="ambient ambient--one" />
        <div className="ambient ambient--two" />
        <header className="scenario-complete-header">
          <div className="brand">
            <span className="brand-mark">DS</span>
            <span>
              <strong>DEV CAMP</strong>
              <small>DEVELOPMENT COMPLETE</small>
            </span>
          </div>
          <button type="button" onClick={resetProject}>
            はじめから
          </button>
        </header>

        <section className="scenario-complete-hero">
          <div>
            <p className="eyebrow">FINAL RELEASE JUDGEMENT</p>
            <h1>{projectConfig.appName}</h1>
            <p>{scenarioResult.summary}</p>
            <small>
              第{scenarioResult.finalTurn}ターンでシナリオ完了 /{' '}
              {formatRunDate(scenarioResult.completedAt)}
            </small>
          </div>
          <div
            className={`scenario-final-rank scenario-final-rank--${scenarioResult.rank.toLowerCase()}`}
          >
            <span>FINAL RANK</span>
            <strong>{scenarioResult.rank}</strong>
            <small>{finalJudgement?.score ?? 0} / 100</small>
          </div>
        </section>

        <section className="scenario-complete-grid">
          <article>
            <span>STRENGTHS</span>
            <ul>
              {(finalJudgement?.strengths ?? ['評価記録がありません。']).map(
                (item) => <li key={item}>{item}</li>,
              )}
            </ul>
          </article>
          <article>
            <span>CONCERNS</span>
            <ul>
              {(finalJudgement?.concerns.length
                ? finalJudgement.concerns
                : ['大きな懸念はありません。']
              ).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <article>
            <span>RECOMMENDATIONS</span>
            <ul>
              {(finalJudgement?.recommendations ?? [
                '次のシナリオへ進みましょう。',
              ]).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        </section>

        <section className="scenario-feature-summary">
          <div>
            <span>BUILT FEATURES</span>
            <h2>完成した機能</h2>
          </div>
          <div className="scenario-verification-summary">
            <span>確認済み {passedCount}</span>
            <span>失敗あり {failedCount}</span>
            <span>未確認・一部 {pendingCount}</span>
          </div>
          {builtFeatureSeeds.length > 0 ? (
            <ul>
              {builtFeatureSeeds.map((seed) => (
                <li key={seed.id}>
                  <div>
                    <strong>{seed.title}</strong>
                    <p>
                      {seed.completionSummary?.summary ?? seed.description}
                    </p>
                  </div>
                  <span
                    className={`verification-status verification-status--${seed.verificationStatus ?? 'unchecked'}`}
                  >
                    {featureVerificationStatusLabel(
                      seed.verificationStatus,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="scenario-empty-feature">
              このシナリオで完成したFeatureSeedはありません。
            </p>
          )}
        </section>

        <button
          className="scenario-restart-button"
          type="button"
          onClick={resetProject}
        >
          はじめから新しいシナリオを始める
        </button>
        {debugPanel}
      </main>
    )
  }

  return (
    <AppShell scene={playScene}>

      <header className="topbar">
        <a className="brand" href="/" aria-label="Dev Success ホーム">
          <span className="brand-mark">DS</span>
          <span>
            <strong>DEV CAMP</strong>
            <small>PROJECT TRAINING GAME</small>
          </span>
        </a>
        <div className="topbar-actions">
          <button
            className="reset-button"
            type="button"
            onClick={resetProject}
            disabled={runningCommand !== null}
          >
            はじめから
          </button>
          <div className="turn-chip">
            <span>TURN</span>
            <strong>{String(status.turn).padStart(2, '0')}</strong>
          </div>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">ACTIVE DEV CAMP</p>
          <h1>{projectConfig.appName}</h1>
          <p className="hero-copy">
            第{status.turn}ターン！ コマンドを選んで、今日の開発をはじめよう！
          </p>
        </div>
        <div className="completion-ring" style={{ '--progress': status.completion } as React.CSSProperties}>
          <div>
            <strong>{status.completion}</strong>
            <span>%</span>
            <small>COMPLETE</small>
          </div>
        </div>
      </section>

      <section className="scenario-progress-panel">
        <div>
          <span>開発スケジュール</span>
          <strong>
            第{status.turn}ターン / 全{scenarioConfig.maxTurn}ターン
          </strong>
        </div>
        <div>
          <span>のこり時間</span>
          <strong>{isOvertime ? '延長戦' : `残り${remainingTurns}ターン`}</strong>
        </div>
        <div className="scenario-goal">
          <span>今回のゴール</span>
          <strong>{scenarioConfig.goal}</strong>
        </div>
        {(isOvertime || remainingTurns <= 3) && (
          <p className={remainingTurns <= 1 ? 'is-critical' : ''}>
            {isOvertime
              ? '延長戦です。いつでも最終リリース判定できます。'
              : remainingTurns <= 1
                ? '最終リリース判定を検討しましょう。'
                : '終盤です。確かめるや整えるを優先しましょう。'}
          </p>
        )}
      </section>

      <StatusHeader
        appName={projectConfig.appName}
        status={status}
        maxTurn={scenarioConfig.maxTurn}
        latestReleaseJudgement={latestReleaseJudgement}
      />

      <section className="project-meta" aria-label="保存済みプロジェクト設定">
        <div>
          <span>REPOSITORY</span>
          <strong>{projectConfig.repositoryPath || '未設定'}</strong>
        </div>
        <div>
          <span>TECH STACK</span>
          <strong>{projectConfig.techStack}</strong>
        </div>
        <div>
          <span>PACKAGE</span>
          <strong>{projectConfig.packageManager}</strong>
        </div>
        <div>
          <span>AGENT</span>
          <strong>{projectConfig.defaultAgent}</strong>
        </div>
      </section>

      <section className="repository-status-panel">
        <div>
          <span>LOCAL REPOSITORY</span>
          <strong>{projectConfig.repositoryPath || 'パス未設定'}</strong>
        </div>
        <button
          type="button"
          onClick={() => void checkRepositoryStatus()}
          disabled={repositoryLoading}
        >
          {repositoryLoading ? '確認中…' : 'リポジトリ状態を確認'}
        </button>
        {repositoryStatus && (
          <div className="repository-status-result" aria-live="polite">
            <div>
              <span>EXISTS</span>
              <strong>{repositoryStatus.exists ? 'YES' : 'NO'}</strong>
            </div>
            <div>
              <span>GIT REPOSITORY</span>
              <strong>
                {repositoryStatus.isGitRepository ? 'YES' : 'NO'}
              </strong>
            </div>
            <div>
              <span>BRANCH</span>
              <strong>{repositoryStatus.currentBranch || '—'}</strong>
            </div>
            <div>
              <span>CHANGED FILES</span>
              <strong>{repositoryStatus.changedFiles.length}</strong>
            </div>
            {repositoryStatus.error && (
              <p>{repositoryStatus.error}</p>
            )}
            {repositoryStatus.changedFiles.length > 0 && (
              <p>{repositoryStatus.changedFiles.join(' / ')}</p>
            )}
          </div>
        )}
      </section>

      {contextSummary && (
        <section className="context-summary-panel">
          <div className="context-summary-heading">
            <div>
              <span>PROJECT CONTEXT</span>
              <h2>プロジェクト状況の整理</h2>
            </div>
            <time dateTime={contextSummary.generatedAt}>
              TURN {contextSummary.turn} /{' '}
              {formatRunDate(contextSummary.generatedAt)}
            </time>
          </div>
          <p className="context-summary-copy">{contextSummary.summary}</p>
          <div className="context-summary-grid">
            <div>
              <span>RECENT PROGRESS</span>
              <ul>
                {contextSummary.recentProgress.length > 0 ? (
                  contextSummary.recentProgress.map((item) => (
                    <li key={item}>{item}</li>
                  ))
                ) : (
                  <li>記録された進捗はまだありません。</li>
                )}
              </ul>
            </div>
            <div>
              <span>OPEN CONCERNS</span>
              <ul>
                {contextSummary.openConcerns.length > 0 ? (
                  contextSummary.openConcerns.map((item) => (
                    <li key={item}>{item}</li>
                  ))
                ) : (
                  <li>目立った懸念はありません。</li>
                )}
              </ul>
            </div>
            <div>
              <span>SUGGESTED FOCUS</span>
              <div className="context-focus-tags">
                {contextSummary.suggestedFocus.map((category) => (
                  <i key={category}>
                    {featureSeedCategoryLabel(category)}
                  </i>
                ))}
              </div>
            </div>
            <div>
              <span>NEXT THINK HINTS</span>
              <ul>
                {contextSummary.nextThinkHints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {playScene === 'release' && <ReleaseJudgementPanel>
        <div className="release-heading">
          <div>
            <span>RELEASE READINESS</span>
            <h2>リリース判定</h2>
            <p>
              完成度・負債・完成済み機能・確認状態を100点満点で評価します。
            </p>
          </div>
          <div className="release-actions">
            <button type="button" onClick={judgeReleaseReadiness}>
              リリース判定する
            </button>
            <button
              className="final-release-button"
              type="button"
              onClick={completeScenario}
            >
              最終リリース判定
            </button>
          </div>
        </div>

        {latestReleaseJudgement ? (
          <article className="release-result" aria-live="polite">
            <div
              className={`release-rank release-rank--${latestReleaseJudgement.rank.toLowerCase()}`}
            >
              <span>RANK</span>
              <strong>{latestReleaseJudgement.rank}</strong>
              <small>{latestReleaseJudgement.score} / 100</small>
            </div>
            <div className="release-result-body">
              <div className="release-result-meta">
                <span>TURN {latestReleaseJudgement.turn}</span>
                <time dateTime={latestReleaseJudgement.createdAt}>
                  {formatRunDate(latestReleaseJudgement.createdAt)}
                </time>
              </div>
              <h3>{latestReleaseJudgement.summary}</h3>
              <div className="release-columns">
                <div>
                  <span>STRENGTHS</span>
                  <ul>
                    {latestReleaseJudgement.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span>CONCERNS</span>
                  <ul>
                    {latestReleaseJudgement.concerns.length > 0 ? (
                      latestReleaseJudgement.concerns.map((item) => (
                        <li key={item}>{item}</li>
                      ))
                    ) : (
                      <li>大きな懸念はありません。</li>
                    )}
                  </ul>
                </div>
                <div>
                  <span>RECOMMENDATIONS</span>
                  <ul>
                    {latestReleaseJudgement.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <small className="release-history-count">
                判定履歴 {releaseJudgements.length}件
              </small>
            </div>
          </article>
        ) : (
          <p className="release-empty">
            まだ判定されていません。機能を作って確認したら、現在地を測ってみましょう。
          </p>
        )}
      </ReleaseJudgementPanel>}

      <div className="game-grid">
        <aside className="camp-sidebar">
          <StatusPanel status={status} maxTurn={scenarioConfig.maxTurn} />
          <FeatureSeedSlots
            plannedSeeds={plannedFeatureSeeds}
            buildingSeed={buildingFeatureSeed}
            onDiscard={discardFeatureSeed}
          />
        </aside>

        <section
          key={playScene}
          className={`panel command-panel command-scene command-scene--${playScene}`}
        >
          <div className="panel-heading">
            <div>
              <span className="section-number">
                {playScene === 'camp'
                  ? "TODAY'S COMMAND"
                  : sceneCopy[playScene].kicker}
              </span>
              <h2>
                {playScene === 'camp'
                  ? '今日はなにをする？'
                  : sceneCopy[playScene].title}
              </h2>
            </div>
            {playScene === 'camp' ? (
              <span className="keyboard-hint">コマンドを1つ選ぼう</span>
            ) : (
              <button
                className="scene-back-button"
                type="button"
                onClick={() => setPlayScene('camp')}
              >
                ← キャンプへ戻る
              </button>
            )}
          </div>

          {playScene === 'camp' ? (
            <>
              <CharacterStage
                appName={projectConfig.appName}
                message={
                  gameLoopMessage ||
                  (buildingFeatureSeed
                    ? `${buildingFeatureSeed.title}を実装中です。レビューを進めましょう。`
                    : '次のコマンドを選んで、アプリを育てましょう。')
                }
                plannedCount={plannedFeatureSeeds.length}
                buildingSeed={buildingFeatureSeed}
                uncheckedCount={
                  builtFeatureSeeds.filter(
                    (seed) =>
                      !seed.verificationStatus ||
                      seed.verificationStatus === 'unchecked' ||
                      seed.verificationStatus === 'partial',
                  ).length
                }
                completion={status.completion}
              />
              <CommandMenu
                availability={commandAvailability}
                runningCommand={runningCommand}
                onCommand={choosePlayCommand}
                onRelease={chooseReleaseScene}
                onNavigate={setPlayScene}
              />
            </>
          ) : (
            <div className={`scene-title-card scene-title-card--${playScene}`}>
              <span>{sceneCopy[playScene].kicker}</span>
              <strong>{sceneCopy[playScene].title}！</strong>
              <p>{sceneCopy[playScene].message}</p>
            </div>
          )}

          {gameLoopMessage && (
            <p className="game-loop-message" aria-live="polite">
              {gameLoopMessage}
            </p>
          )}

          {playScene === 'think' && (
            <div
              className={`idea-generation-status idea-generation-status--${ideaGenerationStatus}`}
              aria-live="polite"
            >
              <div>
                <span>
                  {ideaGenerationStatus === 'generating'
                    ? 'AI候補生成中'
                    : ideaGenerationStatus === 'ai'
                      ? 'AI生成'
                      : ideaGenerationStatus === 'repaired'
                        ? 'AI生成を修復'
                        : ideaGenerationStatus === 'mixed'
                          ? 'AI生成を一部補完'
                      : ideaGenerationStatus === 'fallback'
                        ? 'ローカル候補を使用'
                        : '候補生成待ち'}
                </span>
                <strong>
                  {ideaGenerationStatus === 'generating'
                    ? 'プロジェクトの状態を読んで、3つの案を考えています…'
                    : ideaGenerationStatus === 'ai'
                      ? 'AIが現在のプロジェクトから候補を生成しました。'
                      : ideaGenerationStatus === 'repaired'
                        ? 'プロジェクト固有のAI候補を安全な形式に修復しました。'
                        : ideaGenerationStatus === 'mixed'
                          ? '一部候補をプロジェクト固有のローカル候補で補完しました。'
                      : ideaGenerationStatus === 'fallback'
                        ? 'AI生成に失敗したため、ローカル候補を表示しています。'
                        : '「考える」を選ぶと自動で候補を生成します。'}
                </strong>
              </div>
              {(ideaGenerationInfo?.warnings.length ?? 0) > 0 && (
                <details>
                  <summary>
                    修復・補完の内容（
                    {ideaGenerationInfo?.warnings.length}件）
                  </summary>
                  <ul>
                    {ideaGenerationInfo?.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}
              {ideaGenerationInfo?.rawOutput && (
                <details>
                  <summary>AIの生出力を見る</summary>
                  <pre>{ideaGenerationInfo.rawOutput}</pre>
                </details>
              )}
              {ideaGenerationInfo?.error && (
                <small>{ideaGenerationInfo.error}</small>
              )}
            </div>
          )}

          {playScene === 'build' && buildingFeatureSeed && (
            <article className="building-feature-panel">
              <div className="building-feature-heading">
                <div>
                  <span>BUILDING</span>
                  <strong>{buildingFeatureSeed.title}</strong>
                </div>
                <div className="feature-seed-tags">
                  <span>
                    {featureSeedCategoryLabel(buildingFeatureSeed.category)}
                  </span>
                  <span>
                    難易度{' '}
                    {featureSeedDifficultyLabel(
                      buildingFeatureSeed.difficulty,
                    )}
                  </span>
                </div>
              </div>
              <p>{buildingFeatureSeed.description}</p>
              <dl>
                <div>
                  <dt>IMPLEMENTATION HINT</dt>
                  <dd>{buildingFeatureSeed.implementationHint}</dd>
                </div>
                <div>
                  <dt>RISK</dt>
                  <dd>{buildingFeatureSeed.risk}</dd>
                </div>
              </dl>
              {buildingImplementationReview && (
                <ImplementationReviewPanel>
                  <div className="implementation-review-heading">
                    <div>
                      <span>IMPLEMENTATION REVIEW</span>
                      <strong>完成前チェック</strong>
                    </div>
                    <i
                      className={`readiness-badge readiness-badge--${buildingImplementationReview.readiness}`}
                    >
                      {buildingImplementationReview.readiness.toUpperCase()}
                    </i>
                  </div>

                  {agentRunStage !== 'idle' && (
                    <div className="implementation-review-progress" aria-live="polite">
                      <span
                        className={
                          agentRunStage === 'agent' ? 'is-active' : 'is-done'
                        }
                      >
                        {projectConfig.defaultAgent === 'manual'
                          ? '手動実装の準備中'
                          : 'エージェント実行中'}
                      </span>
                      <span
                        className={
                          agentRunStage === 'diff'
                            ? 'is-active'
                            : agentRunStage === 'review'
                              ? 'is-done'
                              : ''
                        }
                      >
                        git diff取得中
                      </span>
                      <span
                        className={
                          agentRunStage === 'review' ? 'is-active' : ''
                        }
                      >
                        レビュー更新中
                      </span>
                    </div>
                  )}

                  <div className="implementation-review-flow">
                    <button
                      type="button"
                      onClick={() => void runBuildingAgent()}
                      disabled={agentRunning}
                    >
                      <span>01</span>
                      {agentRunStage === 'agent'
                        ? projectConfig.defaultAgent === 'manual'
                          ? '手動実装の準備中…'
                          : 'エージェント実行中…'
                        : agentRunStage === 'diff'
                          ? 'git diff取得中…'
                          : agentRunStage === 'review'
                            ? 'レビュー更新中…'
                            : projectConfig.defaultAgent === 'manual'
                              ? '手動実装を開始'
                              : `${getAgentLabel(projectConfig.defaultAgent)}で実行`}
                    </button>
                    <button
                      type="button"
                      onClick={() => void fetchRepositoryDiff()}
                      disabled={repositoryDiffLoading}
                    >
                      <span>02</span>
                      {repositoryDiffLoading
                        ? 'diff取得中…'
                        : 'git diffを取得'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAutomatedVerification('typecheck')}
                      disabled={runningVerificationType !== null}
                    >
                      <span>03</span>
                      {runningVerificationType === 'typecheck'
                        ? 'typecheck実行中…'
                        : 'typecheckを実行'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAutomatedVerification('test')}
                      disabled={runningVerificationType !== null}
                    >
                      <span>04</span>
                      {runningVerificationType === 'test'
                        ? 'test実行中…'
                        : 'testを実行'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAutomatedVerification('build')}
                      disabled={runningVerificationType !== null}
                    >
                      <span>04+</span>
                      {runningVerificationType === 'build'
                        ? 'build実行中…'
                        : 'buildを実行'}
                    </button>
                  </div>

                  <div className="implementation-review-grid">
                    <div>
                      <span>AGENT RESULT</span>
                      <strong>
                        {buildingImplementationReview.agentRun
                          ? buildingImplementationReview.agentRun.agentKind ===
                            'manual'
                            ? '手動'
                            : buildingImplementationReview.agentRun.success
                            ? '成功'
                            : '失敗'
                          : '未実行'}
                      </strong>
                      <small>
                        {buildingImplementationReview.agentRun
                          ? `exit ${buildingImplementationReview.agentRun.exitCode ?? '—'} / ${buildingImplementationReview.agentRun.durationMs}ms`
                          : '実行結果はまだありません'}
                      </small>
                    </div>
                    <div>
                      <span>GIT DIFF</span>
                      <strong>
                        {buildingImplementationReview.repositoryDiff
                          ? buildingImplementationReview.repositoryDiff.error
                            ? '取得失敗'
                            : `${buildingImplementationReview.repositoryDiff.fileCount} files / ${buildingImplementationReview.repositoryDiff.riskLevel}`
                          : '未取得'}
                      </strong>
                      <small>
                        {buildingImplementationReview.repositoryDiff
                          ? buildingImplementationReview.repositoryDiff.error ??
                            `+${buildingImplementationReview.repositoryDiff.insertions} / -${buildingImplementationReview.repositoryDiff.deletions}`
                          : '差分規模はまだ不明です'}
                      </small>
                    </div>
                    <div>
                      <span>VERIFICATIONS</span>
                      <strong>
                        {buildingImplementationReview.verifications.length}件
                      </strong>
                      <small>
                        {buildingImplementationReview.verifications.length > 0
                          ? buildingImplementationReview.verifications
                              .map(
                                (verification) =>
                                  `${verification.verificationType}:${verification.success ? '成功' : '失敗'}`,
                              )
                              .join(' / ')
                          : '確認結果はまだありません'}
                      </small>
                    </div>
                  </div>

                  <div className="recommended-verifications">
                    <div className="recommended-verifications-heading">
                      <span>RECOMMENDED VERIFICATIONS</span>
                      <strong>おすすめ確認コマンド</strong>
                    </div>
                    <div className="recommended-verification-list">
                      {buildingImplementationReview.recommendedVerifications?.map(
                        (verification) => (
                          <article
                            key={verification.verificationType}
                            className={`recommended-verification recommended-verification--${verification.priority} is-${verification.status}`}
                          >
                            <div>
                              <span>{verification.verificationType}</span>
                              <div>
                                <i>{verification.priority.toUpperCase()}</i>
                                <i>
                                  {verification.status === 'passed'
                                    ? '成功済み'
                                    : verification.status === 'failed'
                                      ? '失敗中'
                                      : '未実行'}
                                </i>
                              </div>
                            </div>
                            <code>
                              {verification.command || 'コマンド未設定'}
                            </code>
                            <p>{verification.reason}</p>
                            <button
                              type="button"
                              onClick={() =>
                                void runAutomatedVerification(
                                  verification.verificationType,
                                )
                              }
                              disabled={
                                runningVerificationType !== null ||
                                !verification.command.trim()
                              }
                            >
                              {runningVerificationType ===
                              verification.verificationType
                                ? '実行中…'
                                : verification.status === 'not-run'
                                  ? '実行する'
                                  : '再実行する'}
                            </button>
                          </article>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="implementation-review-advice">
                    <div>
                      <span>CONCERNS</span>
                      <ul>
                        {buildingImplementationReview.concerns.length > 0 ? (
                          buildingImplementationReview.concerns.map((item) => (
                            <li key={item}>{item}</li>
                          ))
                        ) : (
                          <li>大きな懸念はありません。</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <span>RECOMMENDATIONS</span>
                      <ul>
                        {buildingImplementationReview.recommendations.map(
                          (item) => <li key={item}>{item}</li>,
                        )}
                      </ul>
                    </div>
                  </div>
                  {buildingImplementationReview.repositoryDiff &&
                    !buildingImplementationReview.repositoryDiff.error && (
                    <div className="implementation-review-detail">
                      <span>DIFF DETAILS</span>
                      <p>
                        {buildingImplementationReview.repositoryDiff
                          .changedFiles.length > 0
                          ? buildingImplementationReview.repositoryDiff.changedFiles.join(
                              ' / ',
                            )
                          : '変更ファイルなし'}
                      </p>
                      <pre>
                        {buildingImplementationReview.repositoryDiff.statText ||
                          'stat出力なし'}
                      </pre>
                    </div>
                    )}
                  {buildingImplementationReview.verifications.length > 0 && (
                    <div className="implementation-review-detail">
                      <span>VERIFICATION DETAILS</span>
                      <ul>
                        {buildingImplementationReview.verifications.map(
                          (verification) => (
                            <li
                              key={`${verification.checkedAt}-${verification.verificationType}`}
                            >
                              <strong>
                                {verification.verificationType}:{' '}
                                {verification.success ? '成功' : '失敗'}
                              </strong>
                              <small>{verification.summaryText}</small>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </ImplementationReviewPanel>
              )}
              <div className="building-prompt-preview">
                <div>
                  <span>IMPLEMENTATION PROMPT</span>
                  <div>
                    <button
                      type="button"
                      onClick={() => void copyBuildingPrompt()}
                    >
                      {buildingCopyState === 'copied'
                        ? 'コピーしました'
                        : buildingCopyState === 'failed'
                          ? 'コピー失敗'
                          : 'コピー'}
                    </button>
                    <button
                      className="agent-run-button"
                      type="button"
                      onClick={() => void runBuildingAgent()}
                      disabled={agentRunning}
                    >
                      {agentRunning
                        ? agentRunStage === 'diff'
                          ? 'git diff取得中…'
                          : agentRunStage === 'review'
                            ? 'レビュー更新中…'
                            : projectConfig.defaultAgent === 'manual'
                              ? '手動実装の準備中…'
                              : 'エージェント実行中…'
                        : projectConfig.defaultAgent === 'manual'
                          ? '手動実装を開始'
                          : isAutoRunAgentKind(projectConfig.defaultAgent)
                            ? `${getAgentLabel(projectConfig.defaultAgent)}で実行`
                            : `${projectConfig.defaultAgent}は未対応`}
                    </button>
                  </div>
                </div>
                <pre>{buildingPrompt}</pre>
              </div>
              {displayedAgentRun && (
                <div className="agent-run-result" aria-live="polite">
                  <div className="agent-run-summary">
                    <span>AGENT RUN / {displayedAgentRun.agentKind}</span>
                    <strong>
                      {displayedAgentRun.agentKind === 'manual'
                        ? 'MANUAL'
                        : displayedAgentRun.success
                          ? 'SUCCESS'
                          : 'FAILED'}
                    </strong>
                    <small>
                      exitCode: {displayedAgentRun.exitCode ?? '—'} /{' '}
                      {displayedAgentRun.durationMs}ms
                    </small>
                  </div>
                  {displayedAgentRun.error &&
                    displayedAgentRun.agentKind !== 'manual' && (
                    <p className="agent-run-error">
                      {displayedAgentRun.error}
                    </p>
                    )}
                  {displayedAgentRun.agentKind === 'manual' && (
                    <p>
                      自動実行は行いません。プロンプトを外部ツールで実行し、
                      下の欄へ実装結果を貼り付けてください。
                    </p>
                  )}
                  <div className="agent-run-output">
                    <div>
                      <span>STDOUT</span>
                      <pre>{displayedAgentRun.stdout || '出力なし'}</pre>
                    </div>
                    <div>
                      <span>STDERR</span>
                      <pre>{displayedAgentRun.stderr || '出力なし'}</pre>
                    </div>
                  </div>
                  <div className="agent-run-next">
                    <strong>実装結果を確認してください</strong>
                    <ol>
                      <li>git diffを取得して変更内容を確認する</li>
                      <li>typecheck / testを実行する</li>
                      <li>
                        問題がなければ、下の「この機能を完成にする」を押す
                      </li>
                    </ol>
                    <button
                      type="button"
                      onClick={() => void fetchRepositoryDiff()}
                      disabled={repositoryDiffLoading}
                    >
                      {repositoryDiffLoading
                        ? 'git diff取得中…'
                        : 'git diffを取得'}
                    </button>
                  </div>
                </div>
              )}
              <label className="building-result-form">
                <span>エージェントなどの実装結果</span>
                <textarea
                  value={implementationResult}
                  onChange={(event) =>
                    setImplementationResult(event.target.value)
                  }
                  placeholder={
                    '例:\n実装に成功しました。\nsrc/App.tsx を更新しました。\nテストは passed です。'
                  }
                  rows={8}
                />
              </label>
              <div className="building-feature-actions">
                <button
                  type="button"
                  onClick={cancelFeatureSeedBuild}
                  disabled={agentRunning}
                >
                  実装を中断する
                </button>
                <button
                  type="button"
                  onClick={completeFeatureSeed}
                  disabled={
                    agentRunning || !implementationResult.trim()
                  }
                >
                  この機能を完成にする
                </button>
              </div>
              {buildingImplementationReview?.readiness === 'reviewable' && (
                <p className="implementation-completion-warning">
                  確認は十分ではありませんが完成にできます。差分と確認結果をもう一度確認してください。
                </p>
              )}
              {buildingImplementationReview?.readiness === 'risky' && (
                <p className="implementation-completion-warning is-risky">
                  リスクがあります。完成にする前に失敗結果や大きな差分を確認してください。
                </p>
              )}
              {buildingImplementationReview?.readiness === 'unknown' && (
                <p className="implementation-completion-warning">
                  エージェント実行結果がありません。手動結果で完成にする場合は内容を十分確認してください。
                </p>
              )}
              {hasFailedRecommendedVerification && (
                <p className="implementation-completion-warning is-risky">
                  おすすめ確認コマンドに失敗中の結果があります。再実行する前に原因を修正してください。
                </p>
              )}
              {hasPendingHighVerification && (
                <p className="implementation-completion-warning">
                  重要な確認が未実行です。high priorityの確認を先に実行することをおすすめします。
                </p>
              )}
            </article>
          )}

          {playScene === 'build' &&
            buildSelectionVisible &&
            plannedFeatureSeeds.length > 0 && (
            <div className="feature-seed-selection build-seed-selection">
              <div className="feature-seed-selection-heading">
                <span>CHOOSE TO BUILD</span>
                <strong>今回作る機能の元</strong>
              </div>
              <div className="build-seed-grid">
                {plannedFeatureSeeds.map((seed) => (
                  <button
                    key={seed.id}
                    type="button"
                    onClick={() => void buildFeatureSeed(seed)}
                    disabled={runningCommand !== null}
                  >
                    <span>{featureSeedCategoryLabel(seed.category)}</span>
                    <strong>{seed.title}</strong>
                    <small>{formatFeatureSeedEffects(seed.effects)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {playScene === 'verify' &&
            verificationSelectionVisible &&
            builtFeatureSeeds.length > 0 && (
            <div className="feature-seed-selection verification-seed-selection">
              <div className="feature-seed-selection-heading">
                <span>CHOOSE TO VERIFY</span>
                <strong>確認する完成済み機能</strong>
              </div>
              <div className="verification-seed-grid">
                {builtFeatureSeeds.map((seed) => {
                  const latestVerification = seed.verifications?.[0]
                  return (
                    <button
                      key={seed.id}
                      type="button"
                      onClick={() => selectVerificationFeatureSeed(seed)}
                    >
                      <div>
                        <span
                          className={`verification-status verification-status--${seed.verificationStatus ?? 'unchecked'}`}
                        >
                          {featureVerificationStatusLabel(
                            seed.verificationStatus,
                          )}
                        </span>
                        <strong>{seed.title}</strong>
                      </div>
                      <p>{seed.description}</p>
                      <small>
                        完成:{' '}
                        {seed.builtAt
                          ? formatRunDate(seed.builtAt)
                          : '日時不明'}
                        {' / '}
                        {latestVerification
                          ? `最新: ${latestVerification.verificationType} ${latestVerification.success ? '成功' : '失敗'}`
                          : '確認履歴なし'}
                      </small>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {playScene === 'think' && latestIdeaOptions.length > 0 && (
            <div className="feature-seed-selection">
              <div className="feature-seed-selection-heading">
                <span>ひらめきチャンス！</span>
                <strong>3つの中から、育てたい機能を選ぼう</strong>
              </div>
              <div className="feature-seed-grid">
                {latestIdeaOptions.map((option) => (
                  <IdeaOptionCard
                    key={option.id}
                    option={option}
                    onSelect={selectFeatureSeed}
                  />
                ))}
              </div>
            </div>
          )}

          {playScene === 'camp' && completedFeatureSeeds.length > 0 && (
            <details className="feature-seed-history">
              <summary>完成・破棄された機能の元</summary>
              <ul>
                {completedFeatureSeeds.slice(0, 6).map((seed) => (
                  <li key={seed.id}>
                    <span>{seed.status.toUpperCase()}</span>
                    <div>
                      <strong>{seed.title}</strong>
                      {seed.status === 'discarded' && (
                        <small>
                          破棄:{' '}
                          {seed.discardedAt
                            ? formatRunDate(seed.discardedAt)
                            : '日時不明'}
                          {seed.discardReason
                            ? ` / 理由: ${seed.discardReason}`
                            : ''}
                        </small>
                      )}
                      {seed.status === 'built' && (
                        <>
                          <small>
                            {featureVerificationStatusLabel(
                              seed.verificationStatus,
                            )}
                          </small>
                          {seed.completionSummary && (
                            <div className="feature-completion-summary">
                              <div>
                                <span>READINESS</span>
                                <strong>
                                  {seed.completionSummary.readiness.toUpperCase()}
                                </strong>
                                <time
                                  dateTime={
                                    seed.completionSummary.completedAt
                                  }
                                >
                                  {formatRunDate(
                                    seed.completionSummary.completedAt,
                                  )}
                                </time>
                              </div>
                              <p>{seed.completionSummary.summary}</p>
                              <dl>
                                <div>
                                  <dt>CHANGED FILES</dt>
                                  <dd>
                                    {seed.completionSummary.changedFiles
                                      .length > 0
                                      ? seed.completionSummary.changedFiles.join(
                                          ' / ',
                                        )
                                      : '変更ファイルなし'}
                                  </dd>
                                </div>
                                <div>
                                  <dt>VERIFICATIONS</dt>
                                  <dd>
                                    {seed.completionSummary.verificationSummary.join(
                                      ' / ',
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>CONCERNS</dt>
                                  <dd>
                                    {seed.completionSummary.concerns.length > 0
                                      ? seed.completionSummary.concerns.join(
                                          ' / ',
                                        )
                                      : '懸念なし'}
                                  </dd>
                                </div>
                                <div>
                                  <dt>RECOMMENDATIONS</dt>
                                  <dd>
                                    {seed.completionSummary.recommendations.join(
                                      ' / ',
                                    )}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          )}
                          {(seed.verifications ?? []).length > 0 && (
                            <ul>
                              {(seed.verifications ?? [])
                                .slice(0, 4)
                                .map((verification) => (
                                  <li
                                    key={`${verification.checkedAt}-${verification.verificationType}`}
                                  >
                                    {verification.verificationType}:{' '}
                                    {verification.success ? '成功' : '失敗'} —{' '}
                                    {verification.summaryText}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {playScene !== 'camp' && <ResultLog>
          {selectedResult ? (
            <article className="result-card" aria-live="polite">
              <div className="result-topline">
                <span>第{selectedResult.turn}ターン</span>
                <span>今回のできごと</span>
              </div>
              {selectedResult.result.turnAdvanced && (
                <p className="turn-progress">
                  ターンが進みました — 第
                  {selectedResult.result.turn}ターンへ
                </p>
              )}
              <h3>{selectedResult.result.title}</h3>
              <p className="result-message">{selectedResult.result.summary}</p>
              <ul className="change-list">
                {formatStatusChanges(
                  selectedResult.result.statusChanges,
                  selectedResult.motivationBefore,
                ).map((change) => <li key={change}>{change}</li>)}
              </ul>
              <div className="run-details">
                {selectedResult.result.featureSeedId && (
                  <div>
                    <span>FEATURE SEED</span>
                    <p>
                      {selectedResult.result.featureSeedTitle} /{' '}
                      {selectedResult.result.featureSeedId}
                    </p>
                  </div>
                )}
                <div>
                  <span>FILES</span>
                  <p>
                    {selectedResult.result.changedFiles.length > 0
                      ? selectedResult.result.changedFiles.join(' / ')
                      : '変更ファイルなし'}
                  </p>
                </div>
                <div>
                  <span>LOGS</span>
                  <p>{selectedResult.result.logs.join(' / ')}</p>
                </div>
              </div>
              {selectedResult.result.gitDiff && (
                <div className="diff-result">
                  <div>
                    <span>FILES</span>
                    <strong>{selectedResult.result.gitDiff.fileCount}</strong>
                  </div>
                  <div>
                    <span>INSERTIONS</span>
                    <strong>+{selectedResult.result.gitDiff.insertions}</strong>
                  </div>
                  <div>
                    <span>DELETIONS</span>
                    <strong>-{selectedResult.result.gitDiff.deletions}</strong>
                  </div>
                  <div
                    className={`risk-badge risk-badge--${selectedResult.result.gitDiff.riskLevel}`}
                  >
                    <span>RISK</span>
                    <strong>
                      {selectedResult.result.gitDiff.riskLevel.toUpperCase()}
                    </strong>
                  </div>
                </div>
              )}
              {selectedResult.result.verification && (
                <div className="verification-result">
                  <div>
                    <span>TYPE</span>
                    <strong>
                      {selectedResult.result.verification.verificationType}
                    </strong>
                  </div>
                  <div>
                    <span>COMMAND</span>
                    <strong>
                      {selectedResult.result.verification.command}
                    </strong>
                  </div>
                  <div>
                    <span>RESULT</span>
                    <strong
                      className={
                        selectedResult.result.verification.success
                          ? 'verification-success'
                          : 'verification-failure'
                      }
                    >
                      {selectedResult.result.verification.success
                        ? 'SUCCESS'
                        : 'FAILED'}
                    </strong>
                  </div>
                  <div>
                    <span>ERRORS / WARNINGS</span>
                    <strong>
                      {selectedResult.result.verification.errorCount} /{' '}
                      {selectedResult.result.verification.warningCount}
                    </strong>
                  </div>
                  <div
                    className={`risk-badge risk-badge--${selectedResult.result.verification.riskLevel}`}
                  >
                    <span>RISK</span>
                    <strong>
                      {selectedResult.result.verification.riskLevel.toUpperCase()}
                    </strong>
                  </div>
                </div>
              )}
              <p className="recommendation">
                <span>NEXT</span>
                {selectedResult.result.recommendation}
              </p>
            </article>
          ) : (
            <div className="empty-result">
              <span>メッセージ</span>
              <p>どのコマンドにする？ 迷ったら「考える」から始めてみよう！</p>
            </div>
          )}
          </ResultLog>}
        </section>
      </div>

      <section className="config-section">
        <div className="prompt-heading">
          <div>
            <span className="section-number">03</span>
            <h2>プロジェクト設定</h2>
          </div>
          <span>{configSaved ? 'SAVED' : 'LOCAL CONFIG'}</span>
        </div>

        <div className="config-grid">
          <label>
            <span>アプリ名</span>
            <input
              value={configDraft.appName}
              onChange={(event) =>
                updateConfigDraft('appName', event.target.value)
              }
            />
          </label>
          <label>
            <span>開発スタイル</span>
            <select
              value={configDraft.developmentStyle}
              onChange={(event) =>
                updateConfigDraft(
                  'developmentStyle',
                  event.target.value as DevelopmentStyle,
                )
              }
            >
              <option value="safe">安全重視</option>
              <option value="fast">スピード重視</option>
              <option value="experimental">実験重視</option>
              <option value="quality-focused">品質重視</option>
            </select>
          </label>
          <label className="config-wide">
            <span>プロダクトビジョン</span>
            <textarea
              value={configDraft.productVision}
              onChange={(event) =>
                updateConfigDraft('productVision', event.target.value)
              }
              rows={3}
            />
          </label>
          <label>
            <span>対象ユーザー</span>
            <input
              value={configDraft.targetUser}
              onChange={(event) =>
                updateConfigDraft('targetUser', event.target.value)
              }
            />
          </label>
          <label>
            <span>最初のゴール</span>
            <input
              value={configDraft.initialGoal}
              onChange={(event) =>
                updateConfigDraft('initialGoal', event.target.value)
              }
            />
          </label>
          <label className="config-wide">
            <span>解決したい課題</span>
            <textarea
              value={configDraft.problemStatement}
              onChange={(event) =>
                updateConfigDraft('problemStatement', event.target.value)
              }
              rows={3}
            />
          </label>
          <label>
            <span>リポジトリパス</span>
            <input
              value={configDraft.repositoryPath}
              onChange={(event) =>
                updateConfigDraft('repositoryPath', event.target.value)
              }
              placeholder="/path/to/repository"
            />
          </label>
          <label className="config-wide">
            <span>技術スタック</span>
            <input
              value={configDraft.techStack}
              onChange={(event) =>
                updateConfigDraft('techStack', event.target.value)
              }
            />
          </label>
          <label>
            <span>パッケージマネージャ</span>
            <select
              value={configDraft.packageManager}
              onChange={(event) =>
                updateConfigDraft(
                  'packageManager',
                  event.target.value as PackageManager,
                )
              }
            >
              {['npm', 'pnpm', 'yarn', 'bun', 'other'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>実行エージェント</span>
            <select
              value={configDraft.defaultAgent}
              onChange={(event) =>
                handleConfigAgentChange(event.target.value as AgentKind)
              }
            >
              {SELECTABLE_AGENT_KINDS.map((item) => (
                <option key={item} value={item}>
                  {getAgentLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>エージェントコマンド</span>
            <input
              value={configDraft.agentCommandConfig.codexCommand}
              onChange={(event) =>
                updateAgentCommandConfig('codexCommand', event.target.value)
              }
              placeholder={activeAgentSpec?.defaultCommand ?? 'codex'}
            />
          </label>
          <label>
            <span>エージェント引数</span>
            <input
              value={configDraft.agentCommandConfig.codexArgs}
              onChange={(event) =>
                updateAgentCommandConfig('codexArgs', event.target.value)
              }
              placeholder={activeAgentSpec?.argsPlaceholder ?? '例: exec -'}
            />
          </label>
          <label>
            <span>Agentタイムアウト（ms）</span>
            <input
              type="number"
              min={1_000}
              max={120_000}
              step={1_000}
              value={configDraft.agentTimeoutMs}
              onChange={(event) =>
                updateConfigDraft(
                  'agentTimeoutMs',
                  Number(event.target.value),
                )
              }
            />
          </label>
          <AgentConnectionCheck
            checking={agentConnectionChecking}
            result={agentConnectionResult}
            onCheck={() => void checkAgentConnection()}
          />
          {(['test', 'lint', 'typecheck', 'build'] as const).map((type) => (
            <label key={type}>
              <span>{type} コマンド</span>
              <input
                value={configDraft.verificationCommands[type]}
                onChange={(event) =>
                  updateVerificationCommand(type, event.target.value)
                }
              />
            </label>
          ))}
          <button
            className="config-save-button"
            type="button"
            onClick={saveProjectConfig}
          >
            設定を保存
          </button>
        </div>
      </section>

      <section className="prompt-section">
        <div className="prompt-heading">
          <div>
            <span className="section-number">04</span>
            <h2>AIエージェント用プロンプト</h2>
          </div>
          <span>PREVIEW ONLY / NOT EXECUTED</span>
        </div>

        <div className="prompt-layout">
          <div className="prompt-controls">
            <label>
              <span>コマンド</span>
              <select
                value={promptCommand}
                onChange={(event) => {
                  setPromptCommand(event.target.value as CommandType)
                  setCopyState('idle')
                }}
              >
                {COMMANDS.map((command) => (
                  <option key={command} value={command}>
                    {commandDefinitions[command].label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              「考える」は現在状態から3択を生成し、「作る」は今回選択した
              機能の元から実装プロンプトを生成します。実装結果を取り込むまで
              builtにはなりません。
            </p>
            <div className="prompt-seed-summary">
              <span>FEATURE SEED</span>
              <strong>
                {promptFeatureSeed?.title || '作る対象は未選択です'}
              </strong>
              <p>
                {promptFeatureSeed?.description ||
                  '「作る」を押して、保存済みの機能の元から対象を選んでください。'}
              </p>
            </div>
          </div>

          <div className="prompt-preview">
            <div className="prompt-preview-bar">
              <span>GENERATED PROMPT</span>
              <button type="button" onClick={() => void copyPrompt()}>
                {copyState === 'copied'
                  ? 'コピーしました'
                  : copyState === 'failed'
                    ? 'コピー失敗'
                    : 'コピー'}
              </button>
            </div>
            <pre>{prompt}</pre>
          </div>
        </div>
      </section>

      <section className="import-section">
        <div className="prompt-heading">
          <div>
            <span className="section-number">05</span>
            <h2>AI実行結果を取り込む</h2>
          </div>
          <span>MANUAL IMPORT</span>
        </div>

        <div className="import-layout">
          <div className="import-guide">
            <span>対象コマンド</span>
            <strong>{commandDefinitions[promptCommand].label}</strong>
            <p>
              エージェントなどの実行結果を貼り付けてください。ログ、変更ファイル、
              成功・失敗の語句から簡易的にRunResultを生成します。
            </p>
          </div>
          <label className="import-form">
            <span>AIエージェントの実行結果</span>
            <textarea
              value={pastedResult}
              onChange={(event) => setPastedResult(event.target.value)}
              placeholder={'例:\n実装が成功しました。\nsrc/App.tsx を更新しました。\ntest: passed'}
              rows={9}
            />
            <button
              type="button"
              onClick={importPastedResult}
              disabled={!pastedResult.trim()}
            >
              結果を取り込む
            </button>
          </label>
        </div>
      </section>

      <section className="diff-section">
        <div className="prompt-heading">
          <div>
            <span className="section-number">06</span>
            <h2>git diffを取り込む</h2>
          </div>
          <span>NAME-ONLY / STAT</span>
        </div>

        <div className="repository-diff-panel">
          <div className="repository-diff-heading">
            <div>
              <span>AUTO FETCH</span>
              <strong>{projectConfig.repositoryPath || 'パス未設定'}</strong>
            </div>
            <button
              type="button"
              onClick={() => void fetchRepositoryDiff()}
              disabled={repositoryDiffLoading}
            >
              {repositoryDiffLoading ? '取得中…' : 'git diffを取得'}
            </button>
          </div>

          {repositoryDiff && (
            <div className="repository-diff-result" aria-live="polite">
              {repositoryDiff.error ? (
                <p className="repository-diff-error">
                  {repositoryDiff.error}
                </p>
              ) : (
                <>
                  <div className="diff-result">
                    <div>
                      <span>FILES</span>
                      <strong>{repositoryDiff.fileCount}</strong>
                    </div>
                    <div>
                      <span>INSERTIONS</span>
                      <strong>+{repositoryDiff.insertions}</strong>
                    </div>
                    <div>
                      <span>DELETIONS</span>
                      <strong>-{repositoryDiff.deletions}</strong>
                    </div>
                    <div
                      className={`risk-badge risk-badge--${repositoryDiff.riskLevel}`}
                    >
                      <span>RISK</span>
                      <strong>{repositoryDiff.riskLevel.toUpperCase()}</strong>
                    </div>
                  </div>

                  <div className="repository-diff-details">
                    <div>
                      <span>CHANGED FILES</span>
                      <p>
                        {repositoryDiff.changedFiles.length > 0
                          ? repositoryDiff.changedFiles.join(' / ')
                          : '変更ファイルなし'}
                      </p>
                    </div>
                    <div>
                      <span>GIT DIFF --STAT</span>
                      <pre>{repositoryDiff.statText || '差分なし'}</pre>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={recordRepositoryDiff}
                    disabled={repositoryDiff.fileCount === 0}
                  >
                    この差分を履歴に記録
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="import-layout">
          <div className="import-guide">
            <span>対応形式</span>
            <strong>git diff</strong>
            <p>
              手動の場合は <code>git diff --name-only</code> または
              <code> git diff --stat</code> の出力を貼り付けます。
              直近の実行結果へ変更ファイルとリスク判定を反映します。
            </p>
          </div>
          <label className="import-form">
            <span>リポジトリ差分</span>
            <textarea
              value={gitDiffInput}
              onChange={(event) => setGitDiffInput(event.target.value)}
              placeholder={
                '例:\nsrc/App.tsx | 20 +++++++++++++-------\nsrc/App.css | 8 ++++++++\n2 files changed, 21 insertions(+), 7 deletions(-)'
              }
              rows={9}
            />
            <button
              type="button"
              onClick={importGitDiff}
              disabled={!gitDiffInput.trim()}
            >
              差分を取り込む
            </button>
          </label>
        </div>
      </section>

      <section className="verification-section">
        <div className="prompt-heading">
          <div>
            <span className="section-number">07</span>
            <h2>確認コマンド結果を取り込む</h2>
          </div>
          <span>TEST / LINT / TYPECHECK / BUILD</span>
        </div>

        <div className="verification-target-panel">
          <div>
            <span>VERIFY TARGET</span>
            <strong>
              {buildingFeatureSeed?.title ||
                selectedVerificationSeed?.title ||
                '確認対象が選択されていません'}
            </strong>
            <p>
              {buildingFeatureSeed
                ? '実装レビューへ確認結果を追加します。完成扱いにはなりません。'
                : selectedVerificationSeed?.description ||
                '上の「確かめる」コマンドから、built済みの機能を選んでください。'}
            </p>
          </div>
          <label>
            <span>完成済み機能</span>
            <select
              value={selectedVerificationSeedId ?? ''}
              onChange={(event) => {
                const seed = builtFeatureSeeds.find(
                  (candidate) => candidate.id === event.target.value,
                )
                if (seed) selectVerificationFeatureSeed(seed)
              }}
            >
              <option value="">選択してください</option>
              {builtFeatureSeeds.map((seed) => (
                <option key={seed.id} value={seed.id}>
                  {seed.title} —{' '}
                  {featureVerificationStatusLabel(seed.verificationStatus)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="auto-verification-panel">
          <div className="auto-verification-heading">
            <div>
              <span>AUTO VERIFY</span>
              <strong>
                {projectConfig.repositoryPath || 'リポジトリパス未設定'}
              </strong>
            </div>
            <p>保存済みの確認コマンドをbackend経由で実行します。</p>
          </div>

          <div className="auto-verification-commands">
            {verificationTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void runAutomatedVerification(type)}
                disabled={
                  runningVerificationType !== null ||
                  !hasVerificationTarget
                }
              >
                <span>{type}</span>
                <strong>
                  {runningVerificationType === type
                    ? '実行中…'
                    : projectConfig.verificationCommands[type] || '未設定'}
                </strong>
              </button>
            ))}
          </div>

          {automatedVerification && (
            <div className="auto-verification-result" aria-live="polite">
              <div className="verification-result">
                <div>
                  <span>TYPE</span>
                  <strong>{automatedVerification.verificationType}</strong>
                </div>
                <div>
                  <span>COMMAND</span>
                  <strong>{automatedVerification.command || '—'}</strong>
                </div>
                <div>
                  <span>RESULT</span>
                  <strong
                    className={
                      automatedVerification.success
                        ? 'verification-success'
                        : 'verification-failure'
                    }
                  >
                    {automatedVerification.durationMs === 0 &&
                    automatedVerification.error
                      ? 'NOT EXECUTED'
                      : automatedVerification.success
                        ? 'SUCCESS'
                        : 'FAILED'}
                  </strong>
                </div>
                <div>
                  <span>EXIT / DURATION</span>
                  <strong>
                    {automatedVerification.exitCode ?? '—'} /{' '}
                    {automatedVerification.durationMs}ms
                  </strong>
                </div>
                <div
                  className={`risk-badge risk-badge--${automatedVerification.riskLevel}`}
                >
                  <span>RISK</span>
                  <strong>
                    {automatedVerification.riskLevel.toUpperCase()}
                  </strong>
                </div>
              </div>

              <p className="auto-verification-summary">
                {automatedVerification.summaryText}
                {' / '}errors {automatedVerification.errorCount}
                {' / '}warnings {automatedVerification.warningCount}
              </p>
              {automatedVerification.error && (
                <p className="auto-verification-error">
                  {automatedVerification.error}
                </p>
              )}

              <div className="auto-verification-output">
                <div>
                  <span>STDOUT</span>
                  <pre>{automatedVerification.stdout || '出力なし'}</pre>
                </div>
                <div>
                  <span>STDERR</span>
                  <pre>{automatedVerification.stderr || '出力なし'}</pre>
                </div>
              </div>

              <button
                type="button"
                onClick={recordAutomatedVerification}
                disabled={
                  automatedVerification.durationMs === 0 ||
                  !hasVerificationTarget ||
                  Boolean(buildingFeatureSeed)
                }
              >
                {buildingFeatureSeed
                  ? automatedVerification.durationMs === 0
                    ? '実行できなかったため懸念に記録'
                    : '実装レビューに記録済み'
                  : 'この確認結果を履歴に記録'}
              </button>
            </div>
          )}
        </div>

        <div className="verification-layout">
          <div className="verification-controls">
            <label>
              <span>確認種別</span>
              <select
                value={verificationType}
                disabled={!hasVerificationTarget}
                onChange={(event) => {
                  const nextType = event.target.value as VerificationType
                  setVerificationType(nextType)
                  setVerificationCommand(
                    projectConfig.verificationCommands[nextType],
                  )
                }}
              >
                <option value="test">test</option>
                <option value="lint">lint</option>
                <option value="typecheck">typecheck</option>
                <option value="build">build</option>
              </select>
            </label>
            <label>
              <span>実行コマンド</span>
              <input
                value={verificationCommand}
                disabled={!hasVerificationTarget}
                onChange={(event) => setVerificationCommand(event.target.value)}
                placeholder="pnpm test"
              />
            </label>
          </div>
          <label className="import-form">
            <span>実行結果</span>
            <textarea
              value={verificationOutput}
              disabled={!hasVerificationTarget}
              onChange={(event) => setVerificationOutput(event.target.value)}
              placeholder={
                '例:\nTests: 12 passed\n0 errors\nDone in 2.4s'
              }
              rows={9}
            />
            <button
              type="button"
              onClick={importVerificationResult}
              disabled={
                !verificationOutput.trim() || !hasVerificationTarget
              }
            >
              確認結果を取り込む
            </button>
          </label>
        </div>
      </section>

      <section className="history-section">
        <div className="history-title">
          <span className="section-number">08</span>
          <h2>行動ログ</h2>
          <span>{results.length} RECORDS</span>
        </div>
        {results.length === 0 ? (
          <div className="history-empty">まだ行動ログはありません。</div>
        ) : (
          <div className="history-list">
            {results.map((entry) => (
              <button
                key={entry.result.id}
                type="button"
                className={
                  entry.result.id === selectedResult?.result.id
                    ? 'is-selected'
                    : ''
                }
                onClick={() => selectResult(entry)}
              >
                <span className="timeline-marker" aria-hidden="true" />
                <span className="history-turn">
                  TURN {String(entry.turn).padStart(2, '0')}
                </span>
                <span className="history-command">
                  {commandDefinitions[entry.result.commandType].label}
                </span>
                <time dateTime={entry.result.createdAt}>
                  {formatRunDate(entry.result.createdAt)}
                </time>
                <strong>{entry.result.title}</strong>
                <span className="history-summary">{entry.result.summary}</span>
                <span className="history-changes">
                  {formatStatusChanges(
                    entry.result.statusChanges,
                    entry.motivationBefore,
                  ).join(' / ')}
                </span>
                <i>→</i>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>DEV CAMP / LOCAL PROTOTYPE</span>
        <span>今日も、よい開発を。</span>
      </footer>
      {debugPanel}
    </AppShell>
  )
}

export default App
