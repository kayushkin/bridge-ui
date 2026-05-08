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
    /** Base path for llm-bridge-adapter API. If omitted, bus_session links can't
     * resolve to a bridge_id and the chat button on those cards stays disabled. */
    bridgeAdapterBasePath?: string;
    /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES. */
    routes?: Partial<BridgeRoutes>;
    children: ReactNode;
}
export declare function BridgeProvider({ fetch: fetchFn, basePath, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, bridgeAdapterBasePath, routes, children, }: BridgeProviderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=provider.d.ts.map