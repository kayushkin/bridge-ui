import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { BridgeContext, DEFAULT_BRIDGE_ROUTES, type BridgeConfig, type BridgeRoutes } from './context'
import type { FetchFn } from './types'

interface BridgeProviderProps {
  /** Auth'd fetch function */
  fetch: FetchFn
  /** Base path for bridge API (default: "/api/bridge") */
  basePath?: string
  /** Base path for skill-store API. If omitted, the Skills tab is hidden. */
  skillStoreBasePath?: string
  /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES. */
  routes?: Partial<BridgeRoutes>
  children: ReactNode
}

export function BridgeProvider({
  fetch: fetchFn,
  basePath = '/api/bridge',
  skillStoreBasePath = '',
  routes,
  children,
}: BridgeProviderProps) {
  const config = useMemo<BridgeConfig>(() => ({
    fetch: fetchFn,
    basePath,
    skillStoreBasePath,
    routes: { ...DEFAULT_BRIDGE_ROUTES, ...routes },
  }), [fetchFn, basePath, skillStoreBasePath, routes])

  return <BridgeContext value={config}>{children}</BridgeContext>
}
