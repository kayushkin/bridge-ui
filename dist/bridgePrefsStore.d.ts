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
/** `next` published against `prev`, keeping `prev`'s object identity wherever
 *  the value did not change — the whole record when nothing changed, and each
 *  unchanged sub-record otherwise.
 *
 *  Not a micro-optimisation. `useBridgePrefs` deliberately re-creates
 *  `getDefaults` whenever `prefs.defaults` changes identity, because the
 *  settings form hangs a seeding effect off it — and that effect calls
 *  `setLocalDefaults`, throwing away edits the user has not saved. A re-read
 *  that rebuilt `defaults` from JSON every time would wipe a half-typed spend
 *  ceiling every time anything else on the page refreshed the record. So a
 *  refresh that changes nothing must be indistinguishable from no refresh. */
export declare function reconcilePrefs(prev: BridgePrefs, next: BridgePrefs): BridgePrefs;
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
    /** Re-read the record from the backend and publish it, even though the store
     *  has already settled.
     *
     *  This exists because not every writer of this record goes through
     *  `update`. `permission_mode` is written through `POST
     *  /bridge/permission-mode` on purpose — the type's own doc-comment says so,
     *  because a partial `PUT /bridge-prefs` must not be able to clobber the
     *  mode. A reader hanging off this store would therefore go stale the moment
     *  that other endpoint was written, so the writer calls this afterwards. The
     *  alternative, letting that writer publish into the store directly, puts a
     *  second writer of the record on a path that does not go through `update`,
     *  which is the thing this store exists to stop.
     *
     *  A refresh that finds nothing changed notifies nobody: see
     *  `reconcilePrefs`. Concurrent refreshes share one request. */
    refresh: () => Promise<void>;
    /** One read of the backend, publishing the result with any writes made while
     *  it was in flight replayed on top. Shared by the initial load and by
     *  `refresh`, so a write cannot be reverted by either. */
    private startLoad;
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