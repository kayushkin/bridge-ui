// Constants
export { TRANSPORT_LABEL } from './constants';
// Context & Provider
export { BridgeContext, useBridgeConfig, DEFAULT_BRIDGE_ROUTES } from './context';
export { BridgeProvider } from './provider';
// SSE
export { connectSSE } from './bridgeSSE';
// Hooks
export { useBridgeSession } from './useBridgeSession';
export { useBridgeAttach } from './useBridgeAttach';
export { useBridgeInstances } from './useBridgeInstances';
export { useInstanceReachable, REACHABILITY_INTERVAL_MS } from './useInstanceReachable';
export { useBridgeMachines } from './useBridgeMachines';
export { useBridgeHarnesses } from './useBridgeHarnesses';
export { useBridgePrefs } from './useBridgePrefs';
export { useBridgeFolders } from './useBridgeFolders';
export { useBridgeTools } from './useBridgeTools';
export { useKanban } from './useKanban';
export { useStickyBottomScroll } from './useStickyBottomScroll';
// Utils
export { formatTokens, formatCost, formatDuration, timeAgo } from './utils';
// Page components
export { BridgeLayout } from './components/BridgeLayout';
export { BridgeChat } from './components/BridgeChat';
export { BridgeSessions } from './components/BridgeSessions';
export { BridgeInstances } from './components/BridgeInstances';
export { BridgeSettings } from './components/BridgeSettings';
export { BridgeAuth } from './components/BridgeAuth';
export { BridgeUsage } from './components/BridgeUsage';
export { BridgeConformance } from './components/BridgeConformance';
export { BridgeSkills } from './components/BridgeSkills';
export { BridgeTools } from './components/BridgeTools';
export { BridgePermissions } from './components/BridgePermissions';
export { BridgeAgents } from './components/BridgeAgents';
export { BridgeFiles } from './components/BridgeFiles';
export { BridgeKanban } from './components/BridgeKanban';
export { BridgeAttach } from './components/BridgeAttach';
// Tool renderers — register custom ones via registerToolRenderer
export { ToolItem, DefaultRenderer, getToolRenderer, registerToolRenderer } from './components/tools';
// The auto-grow arithmetic, exported so a host that writes its own composer
// sizes it the same way rather than re-deriving it. Three composers on this
// fleet grow a textarea to its content (this package's, dash's dashv2 page, and
// dash's legacy chat) and two of them shipped the same defect: `scrollHeight`
// excludes the border, so under `box-sizing: border-box` a bare assignment lands
// a border-width short and the box scrolls at every size. Sharing the function
// is what stops the third copy from being written wrong again.
export { composerAutoGrowHeightPx } from './components/chat/Composer';
// Shared status dot — used by header, sidebar, and composer status chip
export { StatusDot } from './components/chat/StatusDot';
// Presentation / self-fetching chat sub-components — exported for standalone
// consumers (e.g. dashv2) that compose the chat surface themselves rather
// than mounting BridgeChat. Behaviour is identical to their use inside
// BridgeChat; each takes its data via props (SessionPermissionMode also reads
// the public BridgeConfig via useBridgeConfig).
export { ToolsPanel } from './components/chat/ToolsPanel';
export { SystemPromptModal } from './components/chat/SystemPromptModal';
export { SessionPermissionMode } from './components/chat/SessionPermissionMode';
export { CostBreakdown } from './components/chat/CostBreakdown';
export { BudgetCeilingBanner } from './components/chat/BudgetCeilingBanner';
export { UsageLine } from './components/chat/UsageLine';
export { MessageStats } from './components/chat/MessageStats';
export { EditableName } from './components/chat/EditableName';
// The pinned "Orchestrator" sidebar entry. Self-fetching against the host's
// producer proxy, so a standalone sidebar mounts it with the two paths its own
// BridgeProvider was given and nothing else.
export { ProducerRow } from './components/chat/ProducerRow';
// Minimal-chrome (mobile) primitives — auto-engaged below 640px viewport.
// `MinimalChromeProvider` is automatically nested inside `BridgeProvider`,
// so consumers don't need to mount it manually.
//
// The body gets a `bridge-minimal-chrome` class — host apps read it to hide
// their own site chrome via plain CSS — but ONLY once a surface has called
// `useRegisterMinimalChrome(true)` to say it is drawing the replacement top bar
// and drawer. Because the provider rides along with `BridgeProvider`, a narrow
// viewport engages `minimal` on every page the host mounts under one, and most
// of those pages draw no chrome at all; hiding the host's header for them takes
// away the last navigation on the page. A host that ports its own minimal chrome
// calls the hook itself — that is what makes the class true for it.
export { useMinimalChrome, useRegisterMinimalChrome, MinimalChromeProvider, MOBILE_BREAKPOINT } from './components/minimal/MinimalChromeContext';
// The three chrome pieces a host can mount unmodified. Each reads the context above
// and takes no pane vocabulary, so a host with its own set of views still gets the
// same top bar, the same drawer and the same controls sheet rather than a copy that
// drifts from this one.
//
// `MinimalPaneSwitch` is deliberately NOT here. It hardcodes bridge-ui's own five
// `PaneKey`s and the callback names behind them, so a host whose views are a different
// set could not mount it as it stands — exporting it would only offer buttons for panes
// that host cannot draw. A pane switch is ~25 lines over the `bc-mc-paneswitch` classes
// this stylesheet already carries; hosts write their own against their own views.
export { MinimalTopBar } from './components/minimal/MinimalTopBar';
export { SessionDrawer } from './components/minimal/SessionDrawer';
export { ChromeSheet } from './components/minimal/ChromeSheet';
// The `?session=<bridge_id>` deeplink reconciler. Pure and dependency-free — no React,
// no router — so any surface that owns its own routing can drive the same two-way
// behaviour BridgeChat has at `/`. dashv2 uses it verbatim rather than growing a second
// implementation that would have to be kept in step with this one. The `awaiting` latch
// in there is the whole reason both directions can coexist; read its header before
// wiring it.
export { readSessionDeeplink, writeSessionParam, initialSessionDeeplinkState, } from './sessionDeeplink';
//# sourceMappingURL=index.js.map