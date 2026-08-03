// Types — canonical (from llm-bridge)
export type {
  TokenUsage,
  Cost,
  Event,
  InstanceCredential,
  InstanceStatus,
  Machine,
  ManagedSession,
  HarnessInfo,
  HarnessDefaults,
  BridgePrefs,
  MaterializedMessage,
  MaterializedTool,
  ResultEvent,
  BridgeInstance,
  BridgeSession,
  CreateSessionRequest,
} from './types'

// Types — UI-specific
export type {
  FetchFn,
  ToolEvent,
  MessageMeta,
  Message,
  LogRow,
  LogRowActor,
  LogRowKind,
  SessionUIState,
  ActivityKind,
  BridgeEvent,
  EventData,
  UseBridgeSessionReturn,
  BudgetHalt,
} from './types'

// Constants
export { TRANSPORT_LABEL } from './constants'

// Context & Provider
export { BridgeContext, useBridgeConfig, DEFAULT_BRIDGE_ROUTES } from './context'
export type { BridgeConfig, BridgeRoutes } from './context'
export { BridgeProvider } from './provider'

// SSE
export { connectSSE } from './bridgeSSE'

// Hooks
export { useBridgeSession } from './useBridgeSession'
export { useBridgeAttach } from './useBridgeAttach'
export type {
  AttachStatus,
  AttachRole,
  AttachExit,
  UseBridgeAttachReturn,
  UseBridgeAttachOptions,
} from './useBridgeAttach'
export { useBridgeInstances } from './useBridgeInstances'
export { useInstanceReachable, REACHABILITY_INTERVAL_MS } from './useInstanceReachable'
export { useBridgeMachines } from './useBridgeMachines'
export { useBridgeHarnesses } from './useBridgeHarnesses'
export { useBridgePrefs } from './useBridgePrefs'
export { useBridgeFolders } from './useBridgeFolders'
export type { UseBridgeFoldersReturn } from './useBridgeFolders'
export { useBridgeTools } from './useBridgeTools'
export type { Tool, ToolKind, MCPSpec, CLISpec, LocalSpec, LocalDescriptor } from './types-tools'
export { useKanban } from './useKanban'
export type {
  Board,
  Column,
  Placement,
  CardLink,
  EntityTag,
  CardView,
  ColumnView,
  BoardView,
  NoteboardItem,
  EntityTypeInfo,
  TagCount,
} from './types-kanban'
export { useStickyBottomScroll } from './useStickyBottomScroll'
export type { StickyBottomScroll, StickyBottomScrollOptions } from './useStickyBottomScroll'

// Utils
export { formatTokens, formatCost, formatDuration, timeAgo } from './utils'

// Page components
export { BridgeLayout } from './components/BridgeLayout'
export { BridgeChat } from './components/BridgeChat'
export { BridgeSessions } from './components/BridgeSessions'
export { BridgeInstances } from './components/BridgeInstances'
export { BridgeSettings } from './components/BridgeSettings'
export { BridgeAuth } from './components/BridgeAuth'
export { BridgeUsage } from './components/BridgeUsage'
export { BridgeConformance } from './components/BridgeConformance'
export { BridgeSkills } from './components/BridgeSkills'
export { BridgeTools } from './components/BridgeTools'
export { BridgePermissions } from './components/BridgePermissions'
export { BridgeAgents } from './components/BridgeAgents'
export { BridgeFiles } from './components/BridgeFiles'
export { BridgeKanban } from './components/BridgeKanban'
export { BridgeAttach } from './components/BridgeAttach'
export type { BridgeAttachProps } from './components/BridgeAttach'

// Tool renderers — register custom ones via registerToolRenderer
export { ToolItem, DefaultRenderer, getToolRenderer, registerToolRenderer } from './components/tools'
export type { ToolRendererProps } from './components/tools'

// Shared status dot — used by header, sidebar, and composer status chip
export { StatusDot } from './components/chat/StatusDot'
export type { StatusDotState } from './components/chat/StatusDot'

// Presentation / self-fetching chat sub-components — exported for standalone
// consumers (e.g. dashv2) that compose the chat surface themselves rather
// than mounting BridgeChat. Behaviour is identical to their use inside
// BridgeChat; each takes its data via props (SessionPermissionMode also reads
// the public BridgeConfig via useBridgeConfig).
export { ToolsPanel } from './components/chat/ToolsPanel'
export type { ToolsPanelProps } from './components/chat/ToolsPanel'
export { SystemPromptModal } from './components/chat/SystemPromptModal'
export type { SystemPromptModalProps } from './components/chat/SystemPromptModal'
export { SessionPermissionMode } from './components/chat/SessionPermissionMode'
export type { SessionPermissionModeProps } from './components/chat/SessionPermissionMode'
export { CostBreakdown } from './components/chat/CostBreakdown'
export type { CostBreakdownProps, CostAggregate } from './components/chat/CostBreakdown'
export type { SpendCeiling } from './components/chat/CostBreakdown'
export { BudgetCeilingBanner } from './components/chat/BudgetCeilingBanner'
export type { BudgetCeilingBannerProps } from './components/chat/BudgetCeilingBanner'
export { UsageLine } from './components/chat/UsageLine'
export type { UsageLineProps } from './components/chat/UsageLine'
export { MessageStats } from './components/chat/MessageStats'
export type { MessageStatsProps } from './components/chat/MessageStats'
export { EditableName } from './components/chat/EditableName'
export type { EditableNameProps } from './components/chat/EditableName'
// The pinned "Orchestrator" sidebar entry. Self-fetching against the host's
// producer proxy, so a standalone sidebar mounts it with the two paths its own
// BridgeProvider was given and nothing else.
export { ProducerRow } from './components/chat/ProducerRow'
export type { ProducerRowProps } from './components/chat/ProducerRow'

// Minimal-chrome (mobile) primitives — auto-engaged below 640px viewport.
// `MinimalChromeProvider` is automatically nested inside `BridgeProvider`,
// so consumers don't need to mount it manually. The body gets a
// `bridge-minimal-chrome` class while minimal mode is active — host apps
// can use it to hide their own site chrome via plain CSS.
export { useMinimalChrome, MinimalChromeProvider } from './components/minimal/MinimalChromeContext'
export type { ChromeOverride } from './components/minimal/MinimalChromeContext'

// The `?session=<bridge_id>` deeplink reconciler. Pure and dependency-free — no React,
// no router — so any surface that owns its own routing can drive the same two-way
// behaviour BridgeChat has at `/`. dashv2 uses it verbatim rather than growing a second
// implementation that would have to be kept in step with this one. The `awaiting` latch
// in there is the whole reason both directions can coexist; read its header before
// wiring it.
export {
  readSessionDeeplink,
  writeSessionParam,
  initialSessionDeeplinkState,
} from './sessionDeeplink'
export type { SessionDeeplinkState } from './sessionDeeplink'
