import type { FetchFn } from './types';
export interface BridgeConfig {
    /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
    fetch: FetchFn;
    /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
    basePath: string;
}
export declare const BridgeContext: import("react").Context<BridgeConfig | null>;
export declare function useBridgeConfig(): BridgeConfig;
//# sourceMappingURL=context.d.ts.map