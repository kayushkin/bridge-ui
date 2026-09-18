import { createElement, useMemo, type JSX } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ChatProvider } from '@kayushkin/chat-core'
import { BridgeProvider, type BridgeProviderProps } from '../provider'
import { DEFAULT_BRIDGE_ROUTES, useBridgeConfig } from '../context'
import type { FetchFn } from '../types'
import { BridgeLayout } from './BridgeLayout'
import { BRIDGE_PAGES, type HostPage } from '../pages'

export interface BridgeProps extends Omit<BridgeProviderProps, 'children' | 'routes'> {
  /** The host's notes page, for `[todo:<id>]` references. Empty means the host has
   *  none and those references render as plain text. */
  notesPath?: string
  /** Draw the Conformance tab. Default true. */
  showConformance?: boolean
  /** Draw the Service inventory tab. Default true. Its page reads `GET /services` on
   *  `basePath`, so a host whose bridge server predates that route hides it. */
  showServiceInventory?: boolean
  /** Pages the host brings into the same shell: routed beside this library's own
   *  and listed in the group each names. Paths are absolute from the root this
   *  component is mounted at. */
  hostPages?: readonly HostPage[]
}

/** The bridge, whole: every page this library ships (`BRIDGE_PAGES`), the
 *  host's own pages if it brings any, the grouped navigation, and the two
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
export function Bridge({ notesPath = '', showConformance, showServiceInventory, hostPages = [], ...provider }: BridgeProps): JSX.Element {
  const routes = useMemo(() => ({ notes: notesPath }), [notesPath])
  return (
    <BridgeProvider {...provider} routes={routes}>
      <ChatStore>
        <Routes>
          <Route element={<BridgeLayout showConformance={showConformance} showServiceInventory={showServiceInventory} hostPages={hostPages} />}>
            {BRIDGE_PAGES.map(p => {
              const path = p.route === 'chat' ? '' : DEFAULT_BRIDGE_ROUTES[p.route].replace(/^\//, '') + (p.routeSuffix ?? '')
              return p.route === 'chat'
                ? <Route key={p.route} index element={createElement(p.component)} />
                : <Route key={p.route} path={path} element={createElement(p.component)} />
            })}
            {hostPages.map(p => (
              <Route key={p.path} path={p.path.replace(/^\//, '')} element={p.element} />
            ))}
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
