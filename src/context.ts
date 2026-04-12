import { createContext, useContext } from 'react'
import type { FetchFn } from './types'

export interface BridgeConfig {
  /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
  fetch: FetchFn
  /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
  basePath: string
}

export const BridgeContext = createContext<BridgeConfig | null>(null)

export function useBridgeConfig(): BridgeConfig {
  const ctx = useContext(BridgeContext)
  if (!ctx) throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>')
  return ctx
}
