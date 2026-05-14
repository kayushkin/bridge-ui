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
export { useBridgeMachines } from './useBridgeMachines';
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
// Tool renderers — register custom ones via registerToolRenderer
export { ToolItem, DefaultRenderer, getToolRenderer, registerToolRenderer } from './components/tools';
// Shared status dot — used by header, sidebar, and composer status chip
export { StatusDot } from './components/chat/StatusDot';
// Minimal-chrome (mobile) primitives — auto-engaged below 640px viewport.
// `MinimalChromeProvider` is automatically nested inside `BridgeProvider`,
// so consumers don't need to mount it manually. The body gets a
// `bridge-minimal-chrome` class while minimal mode is active — host apps
// can use it to hide their own site chrome via plain CSS.
export { useMinimalChrome, MinimalChromeProvider } from './components/minimal/MinimalChromeContext';
//# sourceMappingURL=index.js.map