// Types — canonical (from llm-bridge)
export type {
  TokenUsage,
  Cost,
  InstanceCredential,
  InstanceStatus,
  BridgeInstance,
  CredentialSlot,
} from './types'

// Types — UI-specific
export type {
  FetchFn,
  ToolEvent,
  MessageMeta,
  Message,
  BridgeSession,
  SessionUIState,
  ActivityKind,
  HarnessInfo,
  HarnessDefaults,
  BridgePrefs,
  BridgeEvent,
  CreateSessionOpts,
  UseBridgeSessionReturn,
} from './types'

// Constants
export { HARNESS_LABEL, HARNESS_EMOJI, TRANSPORT_LABEL } from './constants'

// Context & Provider
export { BridgeContext, useBridgeConfig } from './context'
export type { BridgeConfig } from './context'
export { BridgeProvider } from './provider'

// SSE
export { connectSSE } from './bridgeSSE'

// Hooks
export { useBridgeSession } from './useBridgeSession'
export { useBridgeInstances } from './useBridgeInstances'
export { useBridgePrefs } from './useBridgePrefs'
