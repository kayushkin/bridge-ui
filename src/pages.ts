import type { ComponentType, ReactNode } from 'react'
import type { BridgeConfig, BridgeRoutes } from './context'
import { BridgeChat } from './components/chat/BridgeChat'
import { BridgeInstances } from './components/BridgeInstances'
import { BridgeSessions } from './components/BridgeSessions'
import { BridgeAuth } from './components/BridgeAuth'
import { BridgeUsage } from './components/BridgeUsage'
import { BridgeSettings } from './components/BridgeSettings'
import { BridgeAgents } from './components/BridgeAgents'
import { BridgeFiles } from './components/BridgeFiles'
import { BridgeSkills } from './components/BridgeSkills'
import { BridgeTools } from './components/BridgeTools'
import { BridgePermissions } from './components/BridgePermissions'
import { BridgeKanban } from './components/BridgeKanban'
import { BridgeKanbanSettings } from './components/BridgeKanbanSettings'
import { BridgeCardPage } from './components/BridgeCardPage'
import { BridgePrincipals } from './components/BridgePrincipals'
import { BridgeGrants } from './components/BridgeGrants'
import { BridgeBundles } from './components/BridgeBundles'
import { BridgeServiceInventory } from './components/BridgeServiceInventory'
import { BridgeOrchestrator } from './components/BridgeOrchestrator'
import { BridgeConformance } from './components/BridgeConformance'
import { BridgeEffectiveConfig } from './components/BridgeEffectiveConfig'
import { BridgeServiceSettings } from './components/BridgeServiceSettings'
import { BridgeHooks } from './components/BridgeHooks'
import { BridgeInboundRules } from './components/BridgeInboundRules'

/** The navigation groups, in the order they are drawn. A group is drawn only
 *  when at least one of its pages is available on this host.
 *
 *  Pages are grouped by what the person is doing, not by which service answers:
 *  - Work: the sessions and cards being worked, and the chat that drives them.
 *  - Agents: what runs — instances and machines, agent identities, the prompt,
 *    and the skills, tools and bundles they are given.
 *  - Access: who may do what — principals, grants, permission rules, credentials.
 *  - System: the host itself — settings, usage, its services, conformance.
 *  - Personal: pages the host brings that are about the operator, not the agents. */
export type PageGroupKey = 'work' | 'agents' | 'access' | 'system' | 'personal'

export interface PageGroup {
  key: PageGroupKey
  label: string
}

export const PAGE_GROUPS: readonly PageGroup[] = [
  { key: 'work', label: 'Work' },
  { key: 'agents', label: 'Agents' },
  { key: 'access', label: 'Access' },
  { key: 'system', label: 'System' },
  { key: 'personal', label: 'Personal' },
]

/** The two shell switches a host can turn off. */
export interface ShellFlags {
  showConformance: boolean
  showServiceInventory: boolean
}

/** One page this library ships. `routes[route]` is where it is mounted. */
export interface BridgePage {
  route: keyof BridgeRoutes
  label: string
  group: PageGroupKey
  /** Drawn in the navigation. A sub-page — a card, a board's settings — is
   *  routed but not listed; the page it belongs to links to it. */
  listed: boolean
  /** NavLink `end`. The chat lives at the root and would otherwise be active on
   *  every path. */
  end?: boolean
  /** Appended to the route for the <Route> pattern, e.g. '/:cardId'. */
  routeSuffix?: string
  /** Whether this host can show the page at all. Absent means always. A page
   *  that is not available is still routed, so a stale link lands on a page
   *  that says what is missing rather than on nothing. */
  available?: (config: BridgeConfig, flags: ShellFlags) => boolean
  component: ComponentType
}

export const BRIDGE_PAGES: readonly BridgePage[] = [
  // Work
  { route: 'chat', label: 'Chat', group: 'work', listed: true, end: true, component: BridgeChat },
  { route: 'sessions', label: 'Sessions', group: 'work', listed: true, component: BridgeSessions },
  { route: 'kanban', label: 'Kanban', group: 'work', listed: true, available: c => !!c.kanbanStoreBasePath, component: BridgeKanban },
  { route: 'kanbanSettings', label: 'Board settings', group: 'work', listed: false, component: BridgeKanbanSettings },
  { route: 'card', label: 'Card', group: 'work', listed: false, routeSuffix: '/:cardId', component: BridgeCardPage },
  // The page exists on every host; it is listed only where the producer is
  // proxied, since without it the page can say nothing but "not configured".
  { route: 'orchestrator', label: 'Orchestrator', group: 'work', listed: true, available: c => !!c.producerBasePath, component: BridgeOrchestrator },
  // Agents
  { route: 'instances', label: 'Instances', group: 'agents', listed: true, component: BridgeInstances },
  { route: 'agents', label: 'Agents', group: 'agents', listed: true, component: BridgeAgents },
  { route: 'files', label: 'Files', group: 'agents', listed: true, component: BridgeFiles },
  { route: 'skills', label: 'Skills', group: 'agents', listed: true, available: c => !!c.skillStoreBasePath, component: BridgeSkills },
  { route: 'tools', label: 'Tools', group: 'agents', listed: true, available: c => !!c.toolStoreBasePath, component: BridgeTools },
  { route: 'bundles', label: 'Bundles', group: 'agents', listed: true, available: c => !!c.bundleStoreBasePath, component: BridgeBundles },
  { route: 'hooks', label: 'Hooks', group: 'agents', listed: true, component: BridgeHooks },
  { route: 'inboundRules', label: 'Inbound rules', group: 'agents', listed: true, available: c => !!c.multichatBasePath, component: BridgeInboundRules },
  // Access
  // The directory the Kanban assignees resolve against. Same gate as the
  // assignee UI itself: a host that proxies no principal-store gets no page.
  { route: 'principals', label: 'Principals', group: 'access', listed: true, available: c => !!c.principalStoreBasePath, component: BridgePrincipals },
  // Who may use what. Its own page, because "who holds a grant on this tool"
  // is a question about a resource, not a principal.
  { route: 'grants', label: 'Grants', group: 'access', listed: true, available: c => !!c.grantStoreBasePath, component: BridgeGrants },
  { route: 'permissions', label: 'Permissions', group: 'access', listed: true, available: c => !!c.permissionStoreBasePath, component: BridgePermissions },
  { route: 'auth', label: 'Auth', group: 'access', listed: true, component: BridgeAuth },
  // System
  { route: 'settings', label: 'Settings', group: 'system', listed: true, component: BridgeSettings },
  { route: 'usage', label: 'Usage', group: 'system', listed: true, component: BridgeUsage },
  { route: 'effectiveConfig', label: 'Effective config', group: 'system', listed: true, component: BridgeEffectiveConfig },
  { route: 'serviceSettings', label: 'Service settings', group: 'system', listed: true, component: BridgeServiceSettings },
  // Reads the bridge server itself (`GET /services` on basePath), so no store
  // base path gates it; a host whose server lacks the route turns it off.
  { route: 'serviceInventory', label: 'Service inventory', group: 'system', listed: true, available: (_, f) => f.showServiceInventory, component: BridgeServiceInventory },
  { route: 'conformance', label: 'Conformance', group: 'system', listed: true, available: (_, f) => f.showConformance, component: BridgeConformance },
]

/** A page the host brings into the same shell and navigation. `path` is
 *  absolute from the host's root, where `<Bridge>` is mounted. */
export interface HostPage {
  path: string
  label: string
  group: PageGroupKey
  element: ReactNode
  end?: boolean
}

/** One entry of the navigation, whichever side it came from. */
export interface NavEntry {
  to: string
  label: string
  group: PageGroupKey
  end: boolean
}

/** The navigation for this host: every listed page that is available, in
 *  registry order, then the host's pages in the order given. */
export function navEntriesFor(config: BridgeConfig, flags: ShellFlags, hostPages: readonly HostPage[] = []): NavEntry[] {
  const own: NavEntry[] = BRIDGE_PAGES
    .filter(p => p.listed && (p.available ? p.available(config, flags) : true))
    .map(p => ({ to: config.routes[p.route], label: p.label, group: p.group, end: p.end ?? false }))
  const host: NavEntry[] = hostPages.map(p => ({ to: p.path, label: p.label, group: p.group, end: p.end ?? false }))
  return [...own, ...host]
}

/** Which group the current path belongs to: the group of the page whose route
 *  is the longest prefix of the path, listed or not, so a card page lights up
 *  Work even though no tab points at it. Null when nothing matches. */
export function groupForPath(pathname: string, routes: BridgeRoutes, hostPages: readonly HostPage[] = []): PageGroupKey | null {
  const candidates: { to: string; group: PageGroupKey; end: boolean }[] = [
    ...BRIDGE_PAGES.map(p => ({ to: routes[p.route], group: p.group, end: p.end ?? false })),
    ...hostPages.map(p => ({ to: p.path, group: p.group, end: p.end ?? false })),
  ]
  let best: { group: PageGroupKey; length: number } | null = null
  for (const c of candidates) {
    if (!c.to) continue
    const matches = c.end ? pathname === c.to : pathname === c.to || pathname.startsWith(c.to.endsWith('/') ? c.to : c.to + '/')
    if (matches && (!best || c.to.length > best.length)) best = { group: c.group, length: c.to.length }
  }
  return best?.group ?? null
}
