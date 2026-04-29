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
export { useBridgeInstances } from './useBridgeInstances'
export { useBridgeMachines } from './useBridgeMachines'
export { useBridgePrefs } from './useBridgePrefs'
export { useBridgeFolders } from './useBridgeFolders'
export type { UseBridgeFoldersReturn } from './useBridgeFolders'
export { useBridgeTools } from './useBridgeTools'
export type { Tool, ToolKind, MCPSpec, CLISpec, LocalSpec, LocalDescriptor } from './types-tools'
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

// Tool renderers — register custom ones via registerToolRenderer
export { ToolItem, DefaultRenderer, getToolRenderer, registerToolRenderer } from './components/tools'
export type { ToolRendererProps } from './components/tools'
