import type { BridgePrefs, FetchFn } from './types';
type Listener = () => void;
export interface BridgePrefsSnapshot {
    readonly prefs: BridgePrefs;
    readonly loaded: boolean;
}
/** Where one store reads its record from and writes it back to. */
export interface BridgePrefsBackend {
    /** The saved record. `{}` when nothing is saved or the read failed — a
     *  failed read must not be reported as a record that exists and is empty,
     *  because callers write merges on top of whatever this returns. */
    load(): Promise<BridgePrefs>;
    /** Persist the caller's `partial` and the `merged` record it produced.
     *  Resolves when the write has settled. */
    save(partial: BridgePrefs, merged: BridgePrefs): Promise<void>;
}
/** `partial` folded onto `prev`. Field-by-field rather than a spread: the three
 *  map-valued fields merge by key, so writing one harness's defaults must not
 *  drop every other harness's. Pure — the store publishes the result, and the
 *  render checks call it directly. */
export declare function mergePrefs(prev: BridgePrefs, partial: BridgePrefs): BridgePrefs;
export declare class BridgePrefsStore {
    private readonly backend;
    private readonly listeners;
    private snapshot;
    private loading;
    /** Partials written while the initial load is in flight. The load publishes
     *  the server's record wholesale, so without replaying these on top of it a
     *  write made in the first few hundred milliseconds is silently reverted —
     *  and one of the things a caller writes here is a cleared spend ceiling.
     *  Null whenever no load is in flight. */
    private writesDuringLoad;
    constructor(backend: BridgePrefsBackend);
    getSnapshot: () => BridgePrefsSnapshot;
    get subscriberCount(): number;
    subscribe: (listener: Listener) => (() => void);
    /** Read the saved record, once per store. Concurrent callers share the one
     *  attempt; a settled store resolves immediately without another request. */
    ensureLoaded: () => Promise<void>;
    /** Fold `partial` into the record, publish it to every subscriber, and
     *  persist it. Resolves when the write has settled. */
    update: (partial: BridgePrefs) => Promise<void>;
    private emit;
}
/** Server-backed prefs. The server is the source of truth for the read;
 *  localStorage is still written so the two modes leave the same trace. */
export declare function serverPrefsBackend(fetchFn: FetchFn, endpoint: string, storagePrefix: string): BridgePrefsBackend;
/** Prefs for a surface with no server behind it. */
export declare function localPrefsBackend(storagePrefix: string): BridgePrefsBackend;
export interface BridgePrefsStoreKey {
    fetch?: FetchFn;
    endpoint?: string;
    storagePrefix: string;
}
/** The one store for this (fetch, endpoint) — or for this storage prefix when
 *  there is no server. Every caller with the same key gets the same object,
 *  which is what makes two consumers on a page one consumer of the record.
 *
 *  Exported for the render checks, which cannot reach a store through the hook.
 *  Not part of the public API: `index.ts` exports only `useBridgePrefs`. */
export declare function bridgePrefsStoreFor(key: BridgePrefsStoreKey): BridgePrefsStore;
export {};
//# sourceMappingURL=bridgePrefsStore.d.ts.map