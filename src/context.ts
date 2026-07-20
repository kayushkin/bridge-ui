import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { FetchFn } from './types'

export interface BridgeRoutes {
  chat: string
  instances: string
  sessions: string
  auth: string
  usage: string
  settings: string
  agents: string
  files: string
  skills: string
  tools: string
  permissions: string
  conformance: string
  kanban: string
}

export const DEFAULT_BRIDGE_ROUTES: BridgeRoutes = {
  chat: '/bridge',
  instances: '/bridge/instances',
  sessions: '/bridge/sessions',
  auth: '/bridge/auth',
  usage: '/bridge/usage',
  settings: '/bridge/settings',
  agents: '/bridge/agents',
  files: '/bridge/files',
  skills: '/bridge/skills',
  tools: '/bridge/tools',
  permissions: '/bridge/permissions',
  conformance: '/bridge/conformance',
  kanban: '/bridge/kanban',
}

export interface BridgeConfig {
  /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
  fetch: FetchFn
  /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
  basePath: string
  /** Base path for skill-store API (e.g. "/api/skill-store"). No trailing
   * slash. If empty, the Skills tab is hidden. */
  skillStoreBasePath: string
  /** Base path for tool-store API (e.g. "/api/tool-store"). No trailing
   * slash. If empty, the Tools tab is hidden. */
  toolStoreBasePath: string
  /** Base path for permission-store API (e.g. "/api/permission-store"). No
   * trailing slash. If empty, the Permissions tab is hidden. */
  permissionStoreBasePath: string
  /** Base path for kanban-store API (e.g. "/api/kanban"). No trailing slash.
   * If empty, the Kanban tab is hidden. */
  kanbanStoreBasePath: string
  /** Base path for the noteboard API (e.g. "/api/noteboard"). No trailing
   * slash. Used by chat reference chips to resolve a todo/item id to its
   * title/status. If empty, todo chips render but say lookup isn't configured. */
  noteboardBasePath: string
  /** Base path for llm-bridge-adapter API (e.g. "/api/llm-bridge-adapter"). No
   * trailing slash. Used to resolve bus_session_id → bridge_id when a kanban
   * card is linked by entity_type=bus_session. If empty, those cards' chat
   * deeplinks are disabled. */
  bridgeAdapterBasePath: string
  /** Base path for usage-store API (e.g. "/api/usage"). No trailing slash.
   * If empty, the spend/limits sections of the Usage tab are hidden and only
   * per-session aggregates from llm-bridge-server are shown. */
  usageStoreBasePath: string
  /** Optional render hook called per harness in the Settings tab. Hosts can
   * use this to inject harness-specific configuration UI keyed on harness
   * name. Return null for harnesses without an extension. */
  renderHarnessExtension: ((harnessName: string) => ReactNode) | null
  /** Route paths for navigation between bridge pages. */
  routes: BridgeRoutes
}

export const BridgeContext = createContext<BridgeConfig | null>(null)

export function useBridgeConfig(): BridgeConfig {
  const ctx = useContext(BridgeContext)
  if (!ctx) throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>')
  return ctx
}
