import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { BridgeContext, DEFAULT_BRIDGE_ROUTES, type BridgeConfig, type BridgeRoutes } from './context'
import type { FetchFn } from './types'

interface BridgeProviderProps {
  /** Auth'd fetch function */
  fetch: FetchFn
  /** Base path for bridge API (default: "/api/bridge") */
  basePath?: string
  /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES. */
  routes?: Partial<BridgeRoutes>
  children: ReactNode
}

export function BridgeProvider({ fetch: fetchFn, basePath = '/api/bridge', routes, children }: BridgeProviderProps) {
  const config = useMemo<BridgeConfig>(() => ({
    fetch: fetchFn,
    basePath,
    routes: { ...DEFAULT_BRIDGE_ROUTES, ...routes },
  }), [fetchFn, basePath, routes])

  return <BridgeContext value={config}>{children}</BridgeContext>
}
