// Types
export type {
  FetchFn,
  ToolEvent,
  APICallUsage,
  MessageMeta,
  Message,
  BridgeSession,
  SessionUIState,
  ActivityKind,
  BridgeInstance,
  CredentialSlot,
  InstanceStatus,
  InstanceCredential,
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
