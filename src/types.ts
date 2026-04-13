// Fetch function type — consumers provide their own auth'd fetch
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>

// --- Message types (bridge-relevant subset) ---

export interface ToolEvent {
  tool: string
  input?: string
  output?: string
  error?: boolean
}

// Mirrors msg.TokenUsage from llm-bridge (snake_case JSON)
export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  reasoning_tokens?: number
  context_tokens?: number
  context_limit?: number
}

// Mirrors msg.Cost from llm-bridge (snake_case JSON)
export interface Cost {
  total_usd: number
  input_usd?: number
  output_usd?: number
  is_byok?: boolean
  upstream_cost?: number
}

// Mirrors msg.ResultEvent from llm-bridge — this is what the server sends as "meta".
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

// Mirrors MaterializedMessage from llm-bridge-server.
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

// --- Bridge domain types ---

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

export interface BridgeInstance {
  id: string
  harness_type: string
  name: string
  host: string
  transport: 'local' | 'ssh'
  ssh_user: string
  ssh_key_path: string
  ssh_port: number
  working_dir: string
  max_concurrent_sessions: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CredentialSlot {
  credential_id: string
  priority: number
  max_concurrent: number
  in_use: number
  available: number
  enabled: boolean
}

export interface InstanceStatus {
  instance: BridgeInstance
  active_sessions: number
  credentials: CredentialSlot[]
  reachable: boolean
  last_checked: string
}

export interface InstanceCredential {
  instance_id: string
  credential_id: string
  priority: number
  max_concurrent: number
  enabled: boolean
}

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
