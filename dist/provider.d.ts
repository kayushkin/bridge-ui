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
    /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES. */
    routes?: Partial<BridgeRoutes>;
    children: ReactNode;
}
export declare function BridgeProvider({ fetch: fetchFn, basePath, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, routes, children, }: BridgeProviderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=provider.d.ts.map