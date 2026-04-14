// --- Canonical types from llm-bridge (single source of truth) ---
//
// These are auto-generated from Go types in llm-bridge/msg/.
// See llm-bridge/ARCHITECTURE.md for the generation workflow.
//
// DO NOT duplicate these types locally. If you need a new API type,
// add the Go struct to llm-bridge/msg/server.go, run generate-ts.sh,
// and import it here.

import type {
  TokenUsage,
  Cost,
  Instance,
  InstanceCredential,
  CredentialStatus,
  InstanceStatus,
  ManagedSession,
  HarnessInfo,
  HarnessDefaults,
  BridgePrefs,
  MaterializedMessage,
  MaterializedTool,
  ResultEvent,
} from '@kayushkin/llm-bridge-types'

// Re-export canonical types for consumers.
export type {
  TokenUsage,
  Cost,
  InstanceCredential,
  InstanceStatus,
  ManagedSession,
  HarnessInfo,
  HarnessDefaults,
  BridgePrefs,
  MaterializedMessage,
  MaterializedTool,
  ResultEvent,
}

// Re-export with backward-compatible aliases where names differ.
export type { Instance as BridgeInstance }
export type { CredentialStatus as CredentialSlot }
export type { ManagedSession as BridgeSession }

// --- UI-specific types (not in llm-bridge) ---

// Fetch function type — consumers provide their own auth'd fetch
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>

// ToolEvent is the UI streaming accumulation type. It differs from the
// canonical MaterializedTool (which has tool_id and input as object) because
// the streaming path creates these with input already stringified.
export interface ToolEvent {
  tool: string
  input?: string
  output?: string
  error?: boolean
}

// MessageMeta extends the canonical ResultEvent with client-side enrichments.
// The server sends ResultEvent as the "meta" field on materialized messages;
// the UI adds tools[], toolCalls, and rawStats during streaming.
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

// Message is the UI's working message type. It extends the server's
// MaterializedMessage with client-side tracking fields (id, sessionId, etc.).
// The server returns MaterializedMessage; the UI normalizes to this shape.
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

export type SessionUIState = 'empty' | 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'aborted'

export type ActivityKind =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'streaming' }
  | { kind: 'tool'; name: string }

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
  sessions: ManagedSession[]
  activeSession: ManagedSession | null
  messages: Message[]
  uiState: SessionUIState
  activity: ActivityKind
  connected: boolean
  error: string | null
  loadingHistory: boolean
  createSession: (opts: CreateSessionOpts) => Promise<ManagedSession | null>
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
