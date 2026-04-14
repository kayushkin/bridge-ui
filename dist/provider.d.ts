import type { ReactNode } from 'react';
import type { FetchFn } from './types';
interface BridgeProviderProps {
    /** Auth'd fetch function */
    fetch: FetchFn;
    /** Base path for bridge API (default: "/api/bridge") */
    basePath?: string;
    children: ReactNode;
}
export declare function BridgeProvider({ fetch: fetchFn, basePath, children }: BridgeProviderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=provider.d.ts.map