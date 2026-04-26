import { createContext, useContext } from 'react'
import type { FetchFn } from './types'

export interface BridgeRoutes {
  chat: string
  /** Optional visual variant routes — when present, BridgeLayout shows extra Chat2/3/4 tabs. */
  chat2?: string
  chat3?: string
  chat4?: string
  instances: string
  sessions: string
  auth: string
  usage: string
  settings: string
  skills: string
  conformance: string
}

export const DEFAULT_BRIDGE_ROUTES: BridgeRoutes = {
  chat: '/bridge',
  chat2: '/bridge/chat2',
  chat3: '/bridge/chat3',
  chat4: '/bridge/chat4',
  instances: '/bridge/instances',
  sessions: '/bridge/sessions',
  auth: '/bridge/auth',
  usage: '/bridge/usage',
  settings: '/bridge/settings',
  skills: '/bridge/skills',
  conformance: '/bridge/conformance',
}

export interface BridgeConfig {
  /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
  fetch: FetchFn
  /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
  basePath: string
  /** Base path for skill-store API (e.g. "/api/skill-store"). No trailing
   * slash. If empty, the Skills tab is hidden. */
  skillStoreBasePath: string
  /** Route paths for navigation between bridge pages. */
  routes: BridgeRoutes
}

export const BridgeContext = createContext<BridgeConfig | null>(null)

export function useBridgeConfig(): BridgeConfig {
  const ctx = useContext(BridgeContext)
  if (!ctx) throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>')
  return ctx
}
