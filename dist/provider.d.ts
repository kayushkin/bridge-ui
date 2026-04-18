import type { ReactNode } from 'react';
import { type BridgeRoutes } from './context';
import type { FetchFn } from './types';
interface BridgeProviderProps {
    /** Auth'd fetch function */
    fetch: FetchFn;
    /** Base path for bridge API (default: "/api/bridge") */
    basePath?: string;
    /** Route overrides. Any unspecified routes fall back to DEFAULT_BRIDGE_ROUTES. */
    routes?: Partial<BridgeRoutes>;
    children: ReactNode;
}
export declare function BridgeProvider({ fetch: fetchFn, basePath, routes, children }: BridgeProviderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=provider.d.ts.map