// Constants
export { TRANSPORT_LABEL } from './constants';
// Context & Provider
export { BridgeContext, useBridgeConfig, DEFAULT_BRIDGE_ROUTES } from './context';
export { BridgeProvider } from './provider';
// SSE
export { connectSSE, connectSessionListSSE } from './bridgeSSE';
export { SESSION_LIST_BASE_RETRY_MS, SESSION_LIST_MAX_RETRY_MS, SessionListStore, applySessionListFrame, sessionListMustReseed, sharedSessionList, useSharedSessionList, } from './sessionListStore';
// Hooks
export { useBridgeSession } from './useBridgeSession';
export { useBridgeAttach } from './useBridgeAttach';
export { useBridgeInstances } from './useBridgeInstances';
export { useInstanceReachable, REACHABILITY_INTERVAL_MS } from './useInstanceReachable';
export { useBridgeMachines } from './useBridgeMachines';
export { useBridgeHarnesses } from './useBridgeHarnesses';
export { useBridgePrefs } from './useBridgePrefs';
export { useBridgeFolders } from './useBridgeFolders';
export { useSessionContentSearch, sessionContentSearchHitsFromPayload, SESSION_CONTENT_SEARCH_DEBOUNCE_MS, } from './useSessionContentSearch';
export { useBridgeTools } from './useBridgeTools';
export { useKanban } from './useKanban';
export { CardBudgetBadge, CardTimelinePanel, describeCardTime, hasClockData } from './components/CardTime';
export { useStickyBottomScroll } from './useStickyBottomScroll';
// Utils
export { formatTokens, formatCost, formatDuration, timeAgo, formatAgeCompact } from './utils';
export { readAgentPrompt, writeAgentPrompt, stripAgentPrompt, suggestAgentPrompt, AGENT_PROMPT_OPEN, AGENT_PROMPT_CLOSE, } from './agentPrompt';
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
// The card view, minus the drawer chrome. A host that wants a card as a PAGE
// mounts this inside its own `.bk-drawer` wrapper; the board's drawer mounts it
// inside the backdrop. Only the chrome differs, so only the chrome is repeated.
export { CardDetail } from './components/BridgeKanban';
// The producer's full review page — conversation + composer (one run per send),
// runs log, cost windows and the injected-context inspector. Ported out of dash,
// which now mounts this at its own `/orchestrator`.
//
// ⚠️ Two providers, not one: `BridgeProvider` for `producerBasePath` and
// `routes`, and chat-core's `<ChatProvider>` for the reference chips, whose
// hooks throw without it. Every other page here needs only the first.
export { BridgeOrchestrator } from './components/BridgeOrchestrator';
export { BridgeAttach } from './components/BridgeAttach';
// Tool renderers — register custom ones via registerToolRenderer.
// Importing this entrypoint self-registers the five built-ins (Bash, Grep, Web,
// File, and Edit/Write/MultiEdit/NotebookEdit); see components/tools/index.ts.
export { ToolItem, DefaultRenderer, ToolsSection, getToolRenderer, registerToolRenderer } from './components/tools';
// `DiffView` computes a patch from a file's before/after CONTENTS; `UnifiedDiffView`
// colours a diff that already exists (git's own output). They are not interchangeable —
// see the note on `UnifiedDiffView`.
export { DiffView, UnifiedDiffView } from './components/tools';
// ToolContext carries the enclosing session id down to the renderers that fetch
// per-tool resources. A host that renders tool cards MUST provide it: the
// EditRenderer and BashRenderer diffs are gated on a non-empty sessionId, and
// the context's default is the empty string — so an unwrapped tool card renders
// its header and silently no diff, with nothing thrown and nothing logged.
export { ToolContext, useToolContext } from './components/tools';
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
// The three side panes. Each is a self-contained pane with its own header and
// collapse control, so a host that owns its own layout decides where the pane
// goes and hands it `style` and `onToggleCollapse`; nothing here assumes the
// recursive workspace tree `BridgeChat` puts them in.
//
// Kanban and Orchestrator fetch their own state from the paths their
// BridgeProvider was given (`kanbanStoreBasePath`, `producerBasePath`), and
// render an empty pane when the host left those unset — an unconfigured host is
// a legible state, not an error. GitPanel is the one that takes state in: its
// repo list and selection are shared with the chat's repo dropdown, so the
// caller owns them. See `GitPanelProps`.
export { GitPanel } from './components/GitPanel';
export { LinkedKanbanPanel } from './components/chat/LinkedKanbanPanel';
export { OrchestratorPanel } from './components/chat/OrchestratorPanel';
// Session signals — one record for a question or a notification a session
// raises, one card that renders it. SignalCard is the card itself;
// SessionSignals and SignalsInbox are the self-fetching surfaces mounted in
// chat, the sidebar inbox and the RefChip session panel.
export { SignalCard, SignalRequestCard } from './components/chat/SignalCard';
export { SessionSignals, SignalsInbox } from './components/chat/SessionSignals';
export { fetchOpenChatSignals, groupSignalsByRequest, resolveSignalQuestions, declineSignalQuestions, useOpenChatSignals, 
// The signal-level close verb: the two resolutions that deliver nothing to
// the raising session. Everything that carries an answer closes through its
// producer's own path instead.
acknowledgeSignal, dismissSignal, 
// Todo propagation: which todos have an open signal against them. The board
// takes the whole map in one request; a view that already knows its one todo
// narrows server-side instead.
fetchOpenSignalsByTodo, fetchOpenSignalsForTodo, useOpenSignalsByTodo, useOpenSignalsForTodo, } from './components/chat/signalData';
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
// The draggable boundary between two panes of a split, and the arithmetic under it.
//
// Exported rather than left internal because its prop list already says it is not
// ours alone: `axis`, a class name, and two accessors. It names no `PaneKey`, reads
// no workspace context and stores nothing — where the panes live and where their
// sizes are kept is entirely the caller's. That parameterization was the point of
// folding the outer and inner resizers into one implementation, and a host with its
// own two-pane split is the third caller it was already shaped for.
//
// `MINIMUM_PANE_PIXELS` comes with it because a caller that clamps its own sizes
// before committing them needs the same number this does; re-deriving it is how the
// two copies that preceded this one drifted.
//
// The handle draws itself with the class the caller passes. `.bc-split-resizer` in
// this package's stylesheet is the styled one; a host loading `styles.css` gets the
// look for free and ships no CSS.
export { SplitDragHandle } from './components/chat/SplitDragHandle';
export { MINIMUM_PANE_PIXELS, EVEN_SPLIT_GROW_UNITS, measureSplitDragGeometry, splitGrowUnitsAfterDrag, } from './components/chat/splitDragGeometry';
// The `?session=<bridge_id>` deeplink reconciler. Pure and dependency-free — no React,
// no router — so any surface that owns its own routing can drive the same two-way
// behaviour BridgeChat has at `/`. dashv2 uses it verbatim rather than growing a second
// implementation that would have to be kept in step with this one. The `awaiting` latch
// in there is the whole reason both directions can coexist; read its header before
// wiring it.
export { readSessionDeeplink, writeSessionParam, initialSessionDeeplinkState, } from './sessionDeeplink';
//# sourceMappingURL=index.js.map