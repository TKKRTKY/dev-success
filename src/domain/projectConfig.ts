import type { ProjectConfig } from './types'

export const DEFAULT_CODEX_COMMAND = 'codex'
export const DEFAULT_CODEX_ARGS = 'exec -'
export const DEFAULT_AGENT_TIMEOUT_MS = 120_000

export const initialProjectConfig: ProjectConfig = {
  appName: 'Dev Success Demo',
  productVision: '',
  targetUser: '',
  problemStatement: '',
  initialGoal: '',
  repositoryPath: '',
  techStack: 'React, TypeScript, Vite',
  packageManager: 'pnpm',
  defaultAgent: 'codex',
  developmentStyle: 'safe',
  agentCommandConfig: {
    codexCommand: DEFAULT_CODEX_COMMAND,
    codexArgs: DEFAULT_CODEX_ARGS,
  },
  agentTimeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
  verificationCommands: {
    test: 'pnpm test',
    lint: 'pnpm lint',
    typecheck: 'pnpm typecheck',
    build: 'pnpm build',
  },
}
