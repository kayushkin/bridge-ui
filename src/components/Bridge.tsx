import { useMemo, type JSX } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ChatProvider } from '@kayushkin/chat-core'
import { BridgeProvider, type BridgeProviderProps } from '../provider'
import { useBridgeConfig } from '../context'
import type { FetchFn } from '../types'
import { BridgeLayout } from './BridgeLayout'
import { BridgeChat } from './chat/BridgeChat'
import { BridgeInstances } from './BridgeInstances'
import { BridgeSessions } from './BridgeSessions'
import { BridgeAuth } from './BridgeAuth'
import { BridgeUsage } from './BridgeUsage'
import { BridgeSettings } from './BridgeSettings'
import { BridgeAgents } from './BridgeAgents'
import { BridgeFiles } from './BridgeFiles'
import { BridgeSkills } from './BridgeSkills'
import { BridgeTools } from './BridgeTools'
import { BridgePermissions } from './BridgePermissions'
import { BridgeKanban } from './BridgeKanban'
import { BridgePrincipals } from './BridgePrincipals'
import { BridgeBundles } from './BridgeBundles'
import { BridgeConformance } from './BridgeConformance'
import { BridgeCardPage } from './BridgeCardPage'
import { BridgeOrchestrator } from './BridgeOrchestrator'

export interface BridgeProps extends Omit<BridgeProviderProps, 'children' | 'routes'> {
  /** The host's notes page, for `[todo:<id>]` references. Empty means the host has
   *  none and those references render as plain text. */
  notesPath?: string
  /** Draw the Conformance tab. Default true. */
  showConformance?: boolean
}

/** The bridge, whole: every page this library ships, its tab row, and the two
 *  providers they read — mounted by a host as ONE thing at the root of a router.
 *
 *  dash mounts it under a splat route and puts its own pages beside it; the
 *  standalone launcher mounts nothing else. Either way this component owns its
 *  host's root: the routes in `DEFAULT_BRIDGE_ROUTES` are what it renders, so a
 *  `?session=` deeplink, a card link or a reference chip built from them lands on
 *  a page this component serves. A host that instead composes pages by hand
 *  under a prefix passes `BridgeProvider` its own `routes` and does not use this.
 *
 *  `ChatProvider` sits above the router on purpose. It is chat-core's session
 *  store and sync engine, and holding it here rather than inside the chat page
 *  means the store survives a switch to Instances or Kanban and back — and that
 *  every page can render a reference chip, which throws without it. */
export function Bridge({ notesPath = '', showConformance, ...provider }: BridgeProps): JSX.Element {
  const routes = useMemo(() => ({ notes: notesPath }), [notesPath])
  return (
    <BridgeProvider {...provider} routes={routes}>
      <ChatStore>
        <Routes>
          <Route element={<BridgeLayout showConformance={showConformance} />}>
            <Route index element={<BridgeChat />} />
            <Route path="instances" element={<BridgeInstances />} />
            <Route path="sessions" element={<BridgeSessions />} />
            <Route path="auth" element={<BridgeAuth />} />
            <Route path="usage" element={<BridgeUsage />} />
            <Route path="settings" element={<BridgeSettings />} />
            <Route path="agents" element={<BridgeAgents />} />
            <Route path="files" element={<BridgeFiles />} />
            <Route path="skills" element={<BridgeSkills />} />
            <Route path="tools" element={<BridgeTools />} />
            <Route path="permissions" element={<BridgePermissions />} />
            <Route path="kanban" element={<BridgeKanban />} />
            <Route path="card/:cardId" element={<BridgeCardPage />} />
            <Route path="principals" element={<BridgePrincipals />} />
            <Route path="bundles" element={<BridgeBundles />} />
            <Route path="orchestrator" element={<BridgeOrchestrator />} />
            <Route path="conformance" element={<BridgeConformance />} />
          </Route>
        </Routes>
      </ChatStore>
    </BridgeProvider>
  )
}

/** chat-core's provider, fed from the same `BridgeConfig` every page reads, so
 *  the chat reaches noteboard and the resolver through whatever the host proxies. */
function ChatStore({ children }: { children: React.ReactNode }): JSX.Element {
  const { fetch: fetchFn, basePath, noteboardBasePath, resolveEndpoint } = useBridgeConfig()
  const chatFetch = useMemo(() => chatFetchOver(fetchFn), [fetchFn])
  return (
    <ChatProvider
      fetch={chatFetch}
      basePath={basePath}
      noteboardBasePath={noteboardBasePath}
      resolveEndpoint={resolveEndpoint}
    >
      {children}
    </ChatProvider>
  )
}

// Adapt the host's fetch (bridge-ui's `FetchFn`, string-only) to the full
// `typeof fetch` signature ChatProvider expects. ApiClient only ever passes string
// URLs, but URL/Request are covered too so the types are honest.
function chatFetchOver(fetchFn: FetchFn): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return fetchFn(url, init)
  }
}
