import type { FetchFn, BridgePrefs, HarnessDefaults } from './types';
interface BridgePrefsOptions {
    /** If provided, prefs are synced to this server endpoint. Otherwise localStorage-only. */
    fetch?: FetchFn;
    /** Server endpoint for prefs (e.g. "/api/session-meta/bridge"). Required if fetch is provided. */
    endpoint?: string;
    /** localStorage key prefix (default: "bridge-prefs") */
    storagePrefix?: string;
}
export declare function useBridgePrefs(options?: BridgePrefsOptions): {
    prefs: BridgePrefs;
    setLastHarness: (harness: string) => void;
    setLastInstanceId: (instanceId: string) => void;
    setLastSession: (harness: string, sessionId: string) => void;
    setLastInstance: (harness: string, instanceId: string) => void;
    setHarnessDefaults: (harness: string, defaults: HarnessDefaults) => void;
    getDefaults: (harness: string) => HarnessDefaults;
    getLastInstance: (harness: string) => string | null;
    getLastSession: (harness: string) => string | null;
    setSessionName: (sessionId: string, name: string) => void;
    getSessionName: (sessionId: string) => string | null;
};
export {};
//# sourceMappingURL=useBridgePrefs.d.ts.map