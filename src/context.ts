import { createContext, useContext } from 'react'
import type { FetchFn } from './types'

export interface BridgeRoutes {
  chat: string
  instances: string
  sessions: string
  auth: string
  usage: string
  settings: string
  conformance: string
}

export const DEFAULT_BRIDGE_ROUTES: BridgeRoutes = {
  chat: '/bridge',
  instances: '/bridge/instances',
  sessions: '/bridge/sessions',
  auth: '/bridge/auth',
  usage: '/bridge/usage',
  settings: '/bridge/settings',
  conformance: '/bridge/conformance',
}

export interface BridgeConfig {
  /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
  fetch: FetchFn
  /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
  basePath: string
  /** Route paths for navigation between bridge pages. */
  routes: BridgeRoutes
}

export const BridgeContext = createContext<BridgeConfig | null>(null)

export function useBridgeConfig(): BridgeConfig {
  const ctx = useContext(BridgeContext)
  if (!ctx) throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>')
  return ctx
}
