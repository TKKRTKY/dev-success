import type { AgentAdapter } from '../domain/types'
import { MockAgentAdapter } from './MockAgentAdapter'

export const agentAdapter: AgentAdapter = new MockAgentAdapter()
