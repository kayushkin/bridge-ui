import type { FetchFn } from './types';
export interface BridgeRoutes {
    chat: string;
    instances: string;
    sessions: string;
    auth: string;
    usage: string;
    settings: string;
    agents: string;
    files: string;
    skills: string;
    tools: string;
    permissions: string;
    conformance: string;
}
export declare const DEFAULT_BRIDGE_ROUTES: BridgeRoutes;
export interface BridgeConfig {
    /** Auth'd fetch function — consumers provide their own (e.g. with cookies or bearer tokens). */
    fetch: FetchFn;
    /** Base path for bridge API (e.g. "/api/bridge"). No trailing slash. */
    basePath: string;
    /** Base path for skill-store API (e.g. "/api/skill-store"). No trailing
     * slash. If empty, the Skills tab is hidden. */
    skillStoreBasePath: string;
    /** Base path for tool-store API (e.g. "/api/tool-store"). No trailing
     * slash. If empty, the Tools tab is hidden. */
    toolStoreBasePath: string;
    /** Base path for permission-store API (e.g. "/api/permission-store"). No
     * trailing slash. If empty, the Permissions tab is hidden. */
    permissionStoreBasePath: string;
    /** Route paths for navigation between bridge pages. */
    routes: BridgeRoutes;
}
export declare const BridgeContext: import("react").Context<BridgeConfig | null>;
export declare function useBridgeConfig(): BridgeConfig;
//# sourceMappingURL=context.d.ts.map