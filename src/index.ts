// Types — canonical (from llm-bridge)
export type {
  TokenUsage,
  Cost,
  Event,
  InstanceCredential,
  InstanceStatus,
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
export { useBridgeMachines } from './useBridgeMachines'
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
export type { StickyBottomScroll } from './useStickyBottomScroll'

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

// Minimal-chrome (mobile) primitives — auto-engaged below 640px viewport.
// `MinimalChromeProvider` is automatically nested inside `BridgeProvider`,
// so consumers don't need to mount it manually. The body gets a
// `bridge-minimal-chrome` class while minimal mode is active — host apps
// can use it to hide their own site chrome via plain CSS.
export { useMinimalChrome, MinimalChromeProvider } from './components/minimal/MinimalChromeContext'
export type { ChromeOverride } from './components/minimal/MinimalChromeContext'
