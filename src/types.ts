// --- Canonical types from llm-bridge (single source of truth) ---
// These are auto-generated from Go types in llm-bridge/msg/.
// See llm-bridge/ARCHITECTURE.md for the generation workflow.

import type {
  TokenUsage,
  Cost,
  Instance,
  InstanceCredential,
  CredentialStatus,
  InstanceStatus,
} from '@kayushkin/llm-bridge-types'

// Re-export canonical types for consumers.
export type { TokenUsage, Cost, InstanceCredential, InstanceStatus }

// Re-export with backward-compatible aliases where names differ.
export type { Instance as BridgeInstance }
export type { CredentialStatus as CredentialSlot }

// --- UI-specific types (not in llm-bridge) ---

// Fetch function type — consumers provide their own auth'd fetch
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>

// ToolEvent is the UI streaming accumulation type. It differs from the
// canonical ToolSummary (which uses error: string) because the UI sets
// error from the tool_result event's is_error boolean during streaming.
export interface ToolEvent {
  tool: string
  input?: string
  output?: string
  error?: boolean
}

// Mirrors msg.ResultEvent from llm-bridge with client-side enrichments.
export interface MessageMeta {
  text?: string
  is_error?: boolean
  usage?: TokenUsage
  cost?: Cost
  duration_ms?: number
  duration_api_ms?: number
  num_turns?: number
  api_calls?: number
  model?: string
  api_call_usages?: TokenUsage[]
  tool_events?: ToolEvent[]
  // Client-side enrichments
  tools?: ToolEvent[]
  toolCalls?: number
  rawStats?: Record<string, unknown>
}

// Materialized message for the UI — flattened from ContentBlock[] to string content.
// This is NOT the same as llm-bridge msg.Message (which uses ContentBlock[]).
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  thinking?: string
  tools?: ToolEvent[]
  meta?: MessageMeta
  raw?: Record<string, unknown>
  done?: boolean
  // Client-side fields (not from server)
  id?: string
  orchestrator?: string
  agent?: string
  sessionId?: string
}

// Server-managed session entity from llm-bridge-server.
// This is NOT the same as llm-bridge msg.Session (which is richer).
export interface BridgeSession {
  id: string
  display_name: string
  harness: string
  instance_id: string
  state: string
  agent_id: string
  client_request_id: string
  created_at: string
  updated_at: string
}

export type SessionUIState = 'empty' | 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'aborted'

export type ActivityKind =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'streaming' }
  | { kind: 'tool'; name: string }

export interface HarnessInfo {
  name: string
  label: string
  emoji: string
  image?: string
  available: boolean
  capabilities: string[]
  supported_providers?: string[]
}

export interface HarnessDefaults {
  model?: string
  effort?: string
  max_budget?: number
  disabled_tools?: string[]
}

export interface BridgePrefs {
  last_harness?: string
  last_instance_id?: string
  last_session?: Record<string, string>
  last_instance?: Record<string, string>
  defaults?: Record<string, HarnessDefaults>
  session_names?: Record<string, string>
}

// --- SSE types ---

export interface BridgeEvent {
  id?: string
  type: string
  data: Record<string, unknown>
}

// --- Hook return types ---

export interface CreateSessionOpts {
  harness: string
  instanceId: string
  agentId: string
  displayName: string
}

export interface UseBridgeSessionReturn {
  sessions: BridgeSession[]
  activeSession: BridgeSession | null
  messages: Message[]
  uiState: SessionUIState
  activity: ActivityKind
  connected: boolean
  error: string | null
  loadingHistory: boolean
  createSession: (opts: CreateSessionOpts) => Promise<BridgeSession | null>
  selectSession: (id: string) => void
  send: (text: string) => void
  interrupt: () => void
  resume: () => void
  stop: () => void
  compact: (summary?: string) => void
  fork: (displayName?: string) => void
  renameSession: (displayName: string) => Promise<void>
  sendConfig: (config: { model?: string; effort?: string; disabled_tools?: string[]; max_budget?: number }) => void
  refreshSessions: () => void
}
