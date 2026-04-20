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
  InstanceStatus,
  ManagedSession,
  HarnessInfo,
  HarnessDefaults,
  BridgePrefs,
  MaterializedMessage,
  MaterializedTool,
  ResultEvent,
  SessionInfo,
  ToolInfo,
  MCPServerInfo,
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
  SessionInfo,
  ToolInfo,
  MCPServerInfo,
}

// Re-export with backward-compatible aliases where names differ.
export type { Instance as BridgeInstance }
export type { ManagedSession as BridgeSession }

// --- UI-specific types (not in llm-bridge) ---

// Fetch function type — consumers provide their own auth'd fetch
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>

// ToolEvent matches the canonical MaterializedTool shape (input as object,
// not stringified). The streaming and history paths both deliver tools in
// this form so renderers can read fields directly.
export interface ToolEvent {
  tool: string
  input?: Record<string, unknown>
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
  // id is the canonical bridge-server MessageID (msg_<ULID>) once known.
  // Before /send returns, optimistic user messages key off clientId instead.
  id?: string
  clientId?: string         // optimistic-only id, replaced by canonical id on /send response
  harnessMessageId?: string // harness-native id, mirrors the server's harness_message_id
  lastEventRowId?: number   // highest SSE RowID applied to this message — dedupes replays
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
  clientId?: string
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
  renameSession: (bridgeID: string, displayName: string) => Promise<void>
  sendConfig: (config: { model?: string; effort?: string; disabled_tools?: string[]; max_budget?: number }) => void
  refreshSessions: () => void
}
