import type { ReactNode } from 'react';
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
    kanban: string;
    /** The host's notes page, for `[todo:<id>]` references. Empty means none. */
    notes: string;
    /** The producer's full review surface (WAL, prior versions, filters), linked
     *  from the sidebar's Orchestrator row and the in-chat orchestrator pane.
     *  Empty means the host doesn't mount it. */
    orchestrator: string;
    /** A second chat surface the host mounts alongside this library's own, shown
     *  as a tab beside Chat. dash carries one (its chat-core rewrite at
     *  `/dashv2`); llmux does not, and gets no tab. Empty means none.
     *
     *  This library ships no such page and never will — the key exists so the
     *  host can put its own next to Chat rather than in its outer site nav, which
     *  is where the two belong while one is replacing the other. */
    chatV2: string;
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
    /** Base path for kanban-store API (e.g. "/api/kanban"). No trailing slash.
     * If empty, the Kanban tab is hidden. */
    kanbanStoreBasePath: string;
    /** Base path for the noteboard API (e.g. "/api/noteboard"). No trailing
     * slash. Used by chat reference chips to resolve a todo/item id to its
     * title/status. If empty, todo chips render but say lookup isn't configured. */
    noteboardBasePath: string;
    /** Base path for llm-bridge-adapter API (e.g. "/api/llm-bridge-adapter"). No
     * trailing slash. Used to resolve bus_session_id → bridge_id when a kanban
     * card is linked by entity_type=bus_session. If empty, those cards' chat
     * deeplinks are disabled. */
    bridgeAdapterBasePath: string;
    /** Base path for the producer (orchestrator) API (e.g. "/api/producer"). No
     * trailing slash. Used by the sidebar's Orchestrator row and the in-chat
     * orchestrator-context pane. If empty, both say the producer isn't
     * configured instead of guessing a path. */
    producerBasePath: string;
    /** Base path for usage-store API (e.g. "/api/usage"). No trailing slash.
     * If empty, the spend/limits sections of the Usage tab are hidden and only
     * per-session aggregates from llm-bridge-server are shown. */
    usageStoreBasePath: string;
    /** Base path for the mailstack API, as the host proxies it. If omitted, the
     * card drawer cannot read a linked email and hides those controls — llmux
     * proxies no mail service, and offering a button that 404s is worse than
     * offering none. */
    mailBasePath: string;
    /** Path to the HOST's own mail page, which is not one of this library's
     * exported pages — hence a plain path rather than an entry in BridgeRoutes,
     * whose contract is that every route has a component here. Empty hides the
     * "open in Mail" deep link while leaving the inline preview available. */
    mailPagePath: string;
    /** Optional render hook called per harness in the Settings tab. Hosts can
     * use this to inject harness-specific configuration UI keyed on harness
     * name. Return null for harnesses without an extension. */
    renderHarnessExtension: ((harnessName: string) => ReactNode) | null;
    /** Route paths for navigation between bridge pages. */
    routes: BridgeRoutes;
}
export declare const BridgeContext: import("react").Context<BridgeConfig | null>;
export declare function useBridgeConfig(): BridgeConfig;
//# sourceMappingURL=context.d.ts.map