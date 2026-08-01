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
export { UsageLine } from './components/chat/UsageLine'
export type { UsageLineProps } from './components/chat/UsageLine'
export { MessageStats } from './components/chat/MessageStats'
export type { MessageStatsProps } from './components/chat/MessageStats'
export { EditableName } from './components/chat/EditableName'
export type { EditableNameProps } from './components/chat/EditableName'

// Session signals — one record for a question or a notification a session
// raises, one card that renders it. SignalCard is the card itself;
// SessionSignals and SignalsInbox are the self-fetching surfaces mounted in
// chat, the sidebar inbox and the RefChip session panel.
export { SignalCard, SignalRequestCard } from './components/chat/SignalCard'
export type { SignalCardProps, SignalRequestCardProps } from './components/chat/SignalCard'
export { SessionSignals, SignalsInbox } from './components/chat/SessionSignals'
export type { SessionSignalsProps, SignalsInboxProps } from './components/chat/SessionSignals'
export {
  fetchOpenChatSignals, groupSignalsByRequest, resolveSignalQuestions,
  declineSignalQuestions, useOpenChatSignals,
  // The signal-level close verb: the two resolutions that deliver nothing to
  // the raising session. Everything that carries an answer closes through its
  // producer's own path instead.
  acknowledgeSignal, dismissSignal,
  // Todo propagation: which todos have an open signal against them. The board
  // takes the whole map in one request; a view that already knows its one todo
  // narrows server-side instead.
  fetchOpenSignalsByTodo, fetchOpenSignalsForTodo, useOpenSignalsByTodo,
  useOpenSignalsForTodo,
} from './components/chat/signalData'
export type { SignalRequest, SignalsResult, UseOpenChatSignals } from './components/chat/signalData'

// Minimal-chrome (mobile) primitives — auto-engaged below 640px viewport.
// `MinimalChromeProvider` is automatically nested inside `BridgeProvider`,
// so consumers don't need to mount it manually. The body gets a
// `bridge-minimal-chrome` class while minimal mode is active — host apps
// can use it to hide their own site chrome via plain CSS.
export { useMinimalChrome, MinimalChromeProvider } from './components/minimal/MinimalChromeContext'
export type { ChromeOverride } from './components/minimal/MinimalChromeContext'
