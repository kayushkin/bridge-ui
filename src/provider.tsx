import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { BridgeContext, type BridgeConfig } from './context'
import type { FetchFn } from './types'

interface BridgeProviderProps {
  /** Auth'd fetch function */
  fetch: FetchFn
  /** Base path for bridge API (default: "/api/bridge") */
  basePath?: string
  children: ReactNode
}

export function BridgeProvider({ fetch: fetchFn, basePath = '/api/bridge', children }: BridgeProviderProps) {
  const config = useMemo<BridgeConfig>(() => ({
    fetch: fetchFn,
    basePath,
  }), [fetchFn, basePath])

  return <BridgeContext value={config}>{children}</BridgeContext>
}
