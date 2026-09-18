import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { FetchFn } from './types'

export interface BridgeRoutes {
  // Where each page this library ships is mounted. `<Bridge>` owns its host's
  // root and routes these itself, so the defaults are the truth for every host
  // that mounts it; a host composing pages by hand under a prefix overrides them.
  chat: string
  instances: string
  sessions: string
  auth: string
  usage: string
  settings: string
  agents: string
  files: string
  skills: string
  tools: string
  permissions: string
  conformance: string
  kanban: string
  /** The per-board settings page (defaults, classifier, priority ladder,
   *  business hours). `?board=<id>` picks the board; without it, the board the
   *  kanban page last opened. */
  kanbanSettings: string
  principals: string
  grants: string
  bundles: string
  /** The host's services, their databases, and a read-only look inside.
   *  Not `/services`: dash owns that path for its topology page and matches
   *  it before the bridge's splat, so the bridge page there was unreachable. */
  serviceInventory: string
  /** What a session is given, setting by setting, with the layer that decided
   *  each — for a stored session (`?session=`) or a dry run (`?harness=…`,
   *  `?board_id=…`). Backed by llm-bridge-server's effective-config routes. */
  effectiveConfig: string
  /** The producer's full review surface (WAL, prior versions, filters), linked
   *  from the sidebar's Orchestrator row and the in-chat orchestrator pane. */
  orchestrator: string
  /** The single-card page. The card id is appended as a path segment. */
  card: string

  // Pages the HOST owns and this library does not provide. No sensible default
  // exists, so it is empty, and a link to an empty route is not rendered at all —
  // the library never guesses a path for a page it doesn't ship.
  /** The host's notes page, for `[todo:<id>]` references. Empty means none. */
  notes: string
}

export const DEFAULT_BRIDGE_ROUTES: BridgeRoutes = {
  chat: '/',
  instances: '/instances',
  sessions: '/sessions',
  auth: '/auth',
  usage: '/usage',
  settings: '/settings',
  agents: '/agents',
  files: '/files',
  skills: '/skills',
  tools: '/tools',
  permissions: '/permissions',
  conformance: '/conformance',
  kanban: '/kanban',
  kanbanSettings: '/kanban/settings',
  principals: '/principals',
  grants: '/grants',
  bundles: '/bundles',
  serviceInventory: '/service-inventory',
  effectiveConfig: '/effective-config',
  orchestrator: '/orchestrator',
  card: '/card',
  notes: '',
}

export interface BridgeConfig {
  /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
  fetch: FetchFn
  /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
  basePath: string
  /** Base path for skill-store API (e.g. "/api/skill-store"). No trailing
   * slash. If empty, the Skills tab is hidden. */
  skillStoreBasePath: string
  /** Base path for tool-store API (e.g. "/api/tool-store"). No trailing
   * slash. If empty, the Tools tab is hidden. */
  toolStoreBasePath: string
  /** Base path for permission-store API (e.g. "/api/permission-store"). No
   * trailing slash. If empty, the Permissions tab is hidden. */
  permissionStoreBasePath: string
  /** Base path for kanban-store API (e.g. "/api/kanban"). No trailing slash.
   * If empty, the Kanban tab is hidden. */
  kanbanStoreBasePath: string
  /** Base path for principal-store API (e.g. "/api/principals"). No trailing
   * slash. If empty, the Principals tab, assignee chips and the assignee
   * editor are hidden — the same convention as `kanbanStoreBasePath` hiding
   * the Kanban tab. */
  principalStoreBasePath: string
  /** Base path for grant-store API (e.g. "/api/grants"). No trailing slash.
   * If empty, the Grants tab is hidden, a principal shows no grants section,
   * and the kanban "Runs on" picker has no assignee lists to put first. */
  grantStoreBasePath: string
  /** Base path for bundle-store API (e.g. "/api/bundle-store"). No trailing
   * slash. If empty, the Bundles tab is hidden. */
  bundleStoreBasePath: string
  /** Base path for repo-store API (e.g. "/api/repo-store"). No trailing slash.
   * The Bundles page reads its repos to preview a resolution for one. If
   * empty, the page lists bundles and says there are no repos to preview. */
  repoStoreBasePath: string
  /** Base path for the noteboard API (e.g. "/api/noteboard"). No trailing
   * slash. Used by chat reference chips to resolve a todo/item id to its
   * title/status. If empty, todo chips render but say lookup isn't configured. */
  noteboardBasePath: string
  /** The host's reference-resolver endpoint (e.g. dash's "/api/resolve"),
   * which classifies a bare uuid by probing the stores in the entity-type
   * registry. If empty, bare-uuid ref chips render as plain text — with no
   * resolver there is no honest way to say what an unclassified id names. */
  resolveEndpoint: string
  /** Base path for llm-bridge-adapter API (e.g. "/api/llm-bridge-adapter"). No
   * trailing slash. Used to resolve bus_session_id → bridge_id when a kanban
   * card is linked by entity_type=bus_session. If empty, those cards' chat
   * deeplinks are disabled. */
  bridgeAdapterBasePath: string
  /** Base path for the producer (orchestrator) API (e.g. "/api/producer"). No
   * trailing slash. Used by the sidebar's Orchestrator row and the in-chat
   * orchestrator-context pane. If empty, both say the producer isn't
   * configured instead of guessing a path. */
  producerBasePath: string
  /** Base path for usage-store API (e.g. "/api/usage"). No trailing slash.
   * If empty, the spend/limits sections of the Usage tab are hidden and only
   * per-session aggregates from llm-bridge-server are shown. */
  usageStoreBasePath: string
  /** Base path for the mailstack API, as the host proxies it. If omitted, the
   * card drawer cannot read a linked email and hides those controls — llmux
   * proxies no mail service, and offering a button that 404s is worse than
   * offering none. */
  mailBasePath: string
  /** Path to the HOST's own mail page, which is not one of this library's
   * exported pages — hence a plain path rather than an entry in BridgeRoutes,
   * whose contract is that every route has a component here. Empty hides the
   * "open in Mail" deep link while leaving the inline preview available. */
  mailPagePath: string
  /** Optional render hook called per harness in the Settings tab. Hosts can
   * use this to inject harness-specific configuration UI keyed on harness
   * name. Return null for harnesses without an extension. */
  renderHarnessExtension: ((harnessName: string) => ReactNode) | null
  /** Route paths for navigation between bridge pages. */
  routes: BridgeRoutes
}

export const BridgeContext = createContext<BridgeConfig | null>(null)

export function useBridgeConfig(): BridgeConfig {
  const ctx = useContext(BridgeContext)
  if (!ctx) throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>')
  return ctx
}
