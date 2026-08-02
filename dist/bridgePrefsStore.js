import { sharedInstance } from './sharedInstance';
/** `partial` folded onto `prev`. Field-by-field rather than a spread: the three
 *  map-valued fields merge by key, so writing one harness's defaults must not
 *  drop every other harness's. Pure — the store publishes the result, and the
 *  render checks call it directly. */
export function mergePrefs(prev, partial) {
    const next = { ...prev };
    if (partial.last_harness)
        next.last_harness = partial.last_harness;
    if (partial.last_instance_id)
        next.last_instance_id = partial.last_instance_id;
    if (partial.last_session)
        next.last_session = { ...next.last_session, ...partial.last_session };
    if (partial.last_instance)
        next.last_instance = { ...next.last_instance, ...partial.last_instance };
    if (partial.defaults)
        next.defaults = { ...next.defaults, ...partial.defaults };
    return next;
}
export class BridgePrefsStore {
    backend;
    listeners = new Set();
    snapshot = { prefs: {}, loaded: false };
    loading = null;
    /** Partials written while the initial load is in flight. The load publishes
     *  the server's record wholesale, so without replaying these on top of it a
     *  write made in the first few hundred milliseconds is silently reverted —
     *  and one of the things a caller writes here is a cleared spend ceiling.
     *  Null whenever no load is in flight. */
    writesDuringLoad = null;
    constructor(backend) {
        this.backend = backend;
    }
    getSnapshot = () => this.snapshot;
    get subscriberCount() {
        return this.listeners.size;
    }
    subscribe = (listener) => {
        this.listeners.add(listener);
        void this.ensureLoaded();
        return () => {
            this.listeners.delete(listener);
            // The snapshot is kept on purpose, as in SharedPoll: a component that
            // unmounts and comes back renders the record it already had instead of
            // re-reading it, and `loaded` stays true so a first-render decision
            // gated on it is not taken twice against an empty record.
        };
    };
    /** Read the saved record, once per store. Concurrent callers share the one
     *  attempt; a settled store resolves immediately without another request. */
    ensureLoaded = () => {
        if (this.snapshot.loaded)
            return Promise.resolve();
        if (this.loading)
            return this.loading;
        const writes = [];
        this.writesDuringLoad = writes;
        const attempt = (async () => {
            let loaded = {};
            try {
                loaded = await this.backend.load();
            }
            catch {
                // A backend reports a failed read as `{}`. If one throws anyway that
                // must not leave every consumer gated on `loaded` waiting forever.
            }
            let prefs = loaded;
            for (const write of writes)
                prefs = mergePrefs(prefs, write);
            this.writesDuringLoad = null;
            this.emit({ prefs, loaded: true });
        })().finally(() => {
            if (this.loading === attempt)
                this.loading = null;
        });
        this.loading = attempt;
        return attempt;
    };
    /** Fold `partial` into the record, publish it to every subscriber, and
     *  persist it. Resolves when the write has settled. */
    update = (partial) => {
        const merged = mergePrefs(this.snapshot.prefs, partial);
        this.writesDuringLoad?.push(partial);
        this.emit({ prefs: merged, loaded: this.snapshot.loaded });
        return this.backend.save(partial, merged);
    };
    emit(next) {
        const current = this.snapshot;
        if (current.prefs === next.prefs && current.loaded === next.loaded)
            return;
        this.snapshot = next;
        for (const listener of [...this.listeners])
            listener();
    }
}
function readLocal(storagePrefix) {
    try {
        const stored = localStorage.getItem(storagePrefix);
        if (stored)
            return JSON.parse(stored);
    }
    catch { /* ignore */ }
    return {};
}
function writeLocal(storagePrefix, prefs) {
    try {
        localStorage.setItem(storagePrefix, JSON.stringify(prefs));
    }
    catch { /* ignore */ }
}
/** Server-backed prefs. The server is the source of truth for the read;
 *  localStorage is still written so the two modes leave the same trace. */
export function serverPrefsBackend(fetchFn, endpoint, storagePrefix) {
    return {
        load: async () => {
            try {
                const res = await fetchFn(endpoint);
                if (res.ok)
                    return (await res.json());
            }
            catch { /* ignore */ }
            return {};
        },
        save: async (partial, merged) => {
            writeLocal(storagePrefix, merged);
            await fetchFn(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partial),
            });
        },
    };
}
/** Prefs for a surface with no server behind it. */
export function localPrefsBackend(storagePrefix) {
    return {
        load: async () => readLocal(storagePrefix),
        save: async (_partial, merged) => { writeLocal(storagePrefix, merged); },
    };
}
/** Owner for stores with no fetch function to key on. There is one localStorage
 *  per document, so its stores are keyed on the prefix alone. */
const localOnlyOwner = {};
/** The one store for this (fetch, endpoint) — or for this storage prefix when
 *  there is no server. Every caller with the same key gets the same object,
 *  which is what makes two consumers on a page one consumer of the record.
 *
 *  Exported for the render checks, which cannot reach a store through the hook.
 *  Not part of the public API: `index.ts` exports only `useBridgePrefs`. */
export function bridgePrefsStoreFor(key) {
    const { fetch: fetchFn, endpoint, storagePrefix } = key;
    if (fetchFn && endpoint) {
        return sharedInstance(fetchFn, `bridge-prefs ${endpoint} ${storagePrefix}`, () => new BridgePrefsStore(serverPrefsBackend(fetchFn, endpoint, storagePrefix)));
    }
    return sharedInstance(localOnlyOwner, `bridge-prefs local ${storagePrefix}`, () => new BridgePrefsStore(localPrefsBackend(storagePrefix)));
}
//# sourceMappingURL=bridgePrefsStore.js.map