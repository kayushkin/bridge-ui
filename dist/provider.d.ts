import type { ReactNode } from 'react';
import { type BridgeRoutes } from './context';
import type { FetchFn } from './types';
interface BridgeProviderProps {
    /** Auth'd fetch function */
    fetch: FetchFn;
    /** Base path for bridge API (default: "/api/bridge") */
    basePath?: string;
    /** Base path for skill-store API. If omitted, the Skills tab is hidden. */
    skillStoreBasePath?: string;
    /** Base path for tool-store API. If omitted, the Tools tab is hidden. */
    toolStoreBasePath?: string;
    /** Base path for permission-store API. If omitted, the Permissions tab is hidden. */
    permissionStoreBasePath?: string;
    /** Base path for kanban-store API. If omitted, the Kanban tab is hidden. */
    kanbanStoreBasePath?: string;
    /** Base path for the noteboard API. If omitted, chat todo chips can't resolve
     * an item's title/status and say so. */
    noteboardBasePath?: string;
    /** Base path for llm-bridge-adapter API. If omitted, bus_session links can't
     * resolve to a bridge_id and the chat button on those cards stays disabled. */
    bridgeAdapterBasePath?: string;
    /** Base path for the producer (orchestrator) API. If omitted, the sidebar's
     * Orchestrator row and the in-chat orchestrator-context pane say the
     * producer isn't configured. */
    producerBasePath?: string;
    /** Base path for the mailstack API as the host proxies it (dash: "/api/mail").
     * If omitted, the kanban card drawer hides its email preview and deep link. */
    mailBasePath?: string;
    /** Path to the host's own mail page (dash: "/mail"). Empty hides the deep link. */
    mailPagePath?: string;
    /** Base path for usage-store API. If omitted, spend/limits sections of the
     * Usage tab are hidden and only per-session aggregates are shown. */
    usageStoreBasePath?: string;
    /** Optional render hook for per-harness Settings-tab extensions. Return null
     * for harnesses that don't need a custom panel. */
    renderHarnessExtension?: (harnessName: string) => ReactNode;
    /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES,
     * which means `notes` and `orchestrator` — pages this library doesn't ship —
     * stay empty and their links aren't rendered until a host names them. */
    routes?: Partial<BridgeRoutes>;
    children: ReactNode;
}
export declare function BridgeProvider({ fetch: fetchFn, basePath, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, mailBasePath, mailPagePath, noteboardBasePath, bridgeAdapterBasePath, producerBasePath, usageStoreBasePath, renderHarnessExtension, routes, children, }: BridgeProviderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=provider.d.ts.map