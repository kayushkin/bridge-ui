import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { BridgeContext, DEFAULT_BRIDGE_ROUTES, type BridgeConfig, type BridgeRoutes } from './context'
import type { FetchFn } from './types'
import { MinimalChromeProvider } from './components/minimal/MinimalChromeContext'

interface BridgeProviderProps {
  /** Auth'd fetch function */
  fetch: FetchFn
  /** Base path for bridge API (default: "/api/bridge") */
  basePath?: string
  /** Base path for skill-store API. If omitted, the Skills tab is hidden. */
  skillStoreBasePath?: string
  /** Base path for tool-store API. If omitted, the Tools tab is hidden. */
  toolStoreBasePath?: string
  /** Base path for permission-store API. If omitted, the Permissions tab is hidden. */
  permissionStoreBasePath?: string
  /** Base path for kanban-store API. If omitted, the Kanban tab is hidden. */
  kanbanStoreBasePath?: string
  /** Base path for llm-bridge-adapter API. If omitted, bus_session links can't
   * resolve to a bridge_id and the chat button on those cards stays disabled. */
  bridgeAdapterBasePath?: string
  /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES. */
  routes?: Partial<BridgeRoutes>
  children: ReactNode
}

export function BridgeProvider({
  fetch: fetchFn,
  basePath = '/api/bridge',
  skillStoreBasePath = '',
  toolStoreBasePath = '',
  permissionStoreBasePath = '',
  kanbanStoreBasePath = '',
  bridgeAdapterBasePath = '',
  routes,
  children,
}: BridgeProviderProps) {
  const config = useMemo<BridgeConfig>(() => ({
    fetch: fetchFn,
    basePath,
    skillStoreBasePath,
    toolStoreBasePath,
    permissionStoreBasePath,
    kanbanStoreBasePath,
    bridgeAdapterBasePath,
    routes: { ...DEFAULT_BRIDGE_ROUTES, ...routes },
  }), [fetchFn, basePath, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, bridgeAdapterBasePath, routes])

  return (
    <BridgeContext value={config}>
      <MinimalChromeProvider>{children}</MinimalChromeProvider>
    </BridgeContext>
  )
}
