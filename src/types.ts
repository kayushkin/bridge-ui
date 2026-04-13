// Fetch function type — consumers provide their own auth'd fetch
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>

// --- Message types (bridge-relevant subset) ---

export interface ToolEvent {
  tool: string
  input?: string
  output?: string
  error?: boolean
}

export interface APICallUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface MessageMeta {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  contextTokens?: number
  contextLimit?: number
  toolCalls?: number
  cost?: number
  durationMs?: number
  durationAPIMs?: number
  numTurns?: number
  apiCalls?: number
  apiCallUsages?: APICallUsage[]
  model?: string
  turn?: number
  tools?: ToolEvent[]
  rawStats?: Record<string, unknown>
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  orchestrator: string
  agent: string
  sessionId: string
  completionId?: string
  isError?: boolean
  meta?: MessageMeta
  thinking?: string
  done?: boolean
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

export interface UseBridgeSessionReturn {
  sessions: BridgeSession[]
  activeSession: BridgeSession | null
  messages: Message[]
  uiState: SessionUIState
  activity: ActivityKind
  connected: boolean
  error: string | null
  loadingHistory: boolean
  createSession: (harness: string, displayName?: string, instanceId?: string) => Promise<BridgeSession | null>
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
