import type { Tool, LocalDescriptor } from './types-tools';
/**
 * useBridgeTools — fetches the global tool list, the in-process registry of
 * available locals, and (lazily, when an instanceID is set) the per-instance
 * opt-in list. Provides toggle actions and a `byInstance` Set for O(1) lookup
 * during render.
 *
 * Polls every 30s like the other bridge hooks. Requires
 * `toolStoreBasePath` on BridgeConfig — the hook returns `loading=false` and
 * empty arrays when unset (the Tools tab is hidden in that case anyway).
 */
export declare function useBridgeTools(instanceID: string | null): {
    tools: Tool[];
    locals: LocalDescriptor[];
    byInstance: Set<string>;
    loading: boolean;
    error: string | null;
    setGlobal: (toolID: number, on: boolean) => Promise<boolean>;
    setForInstance: (toolName: string, on: boolean) => Promise<boolean>;
    refresh: () => Promise<void>;
};
//# sourceMappingURL=useBridgeTools.d.ts.map