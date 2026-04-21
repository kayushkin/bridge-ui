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
  Event,
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
  Event,
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
export type MessageMeta = Partial<ResultEvent> & {
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

// LogRow is the flat event-log view of a session. One row per server event,
// with rows that share a bridge message_id coalesced together (stream deltas
// accumulate text, tool_call/tool_result merge, result adds stats). Rows
// without a message_id (system, session_state, session_info) stand alone.
//
// See useBridgeSession's reducer for the coalesce rules.
export type LogRowActor = 'user' | 'assistant' | 'system'

export interface LogRow {
  // Stable React key: messageId when coalescing, otherwise "evt_<eventId>".
  key: string

  // Displayed IDs.
  clientId?: string
  clientRequestId?: string    // caller's per-turn id, stamped on every event in the turn
  turnId?: string             // bridge-minted per-turn id, covers user_message → result
  messageId?: string          // canonical bridge-server MessageID (msg_<ULID>)
  harnessMessageId?: string   // harness-native completion id (Anthropic msg_…)

  // Internal — tracks which event rows contributed, used to dedup SSE replay.
  eventIds: number[]

  // Header metadata.
  actor: LogRowActor
  eventType: string           // type of the first event for this row
  subtype?: string            // populated for system/thinking events
  timestamp: string

  // Coalesced body payloads.
  text?: string               // user text OR streamed text_delta OR result text
  thinking?: string           // accumulated thinking text
  tools?: ToolEvent[]         // tool_call + tool_result pairs
  usage?: TokenUsage          // per-completion or per-turn token usage
  meta?: MessageMeta          // full result payload (tokens, cost, duration…)
  systemMessage?: string      // SystemEvent.Message
  systemFields?: Record<string, unknown>  // typed SystemEvent fields (attempt, etc.)
  stateTransition?: { from?: string; to: string; reason?: string }
  sessionInfo?: SessionInfo
  errorMessage?: string

  // Raw events that composed this row (for "show raw" expand).
  events: Array<Record<string, unknown>>

  done?: boolean              // terminal row (result, error, user_message)
}

export type SessionUIState = 'empty' | 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'aborted'

export type ActivityKind =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'streaming' }
  | { kind: 'tool'; name: string }

// --- SSE types ---

// EventData is the canonical bridge Event, extended with event_id which
// log-store injects when replaying history (not present on live SSE events).
export type EventData = Event & { event_id?: number }

export interface BridgeEvent {
  id?: string                   // SSE `id:` line, stringified row id
  type: string                  // SSE `event:` line; mirrors data.type for live events
  data: EventData
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
  logRows: LogRow[]
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
