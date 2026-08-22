import type { SessionListFrame, SessionListResume } from './bridgeSSE';
import type { FetchFn, ManagedSession } from './types';
/** Longest wait between reconnect attempts. */
export declare const SESSION_LIST_MAX_RETRY_MS = 30000;
/** First wait after a dropped connection, doubled up to the maximum. */
export declare const SESSION_LIST_BASE_RETRY_MS = 1000;
export interface SessionListSnapshot {
    readonly sessions: ManagedSession[];
    /** True until the first seed settles, however it settles. */
    readonly loading: boolean;
    /** True while the seed is answering and the stream is up. */
    readonly connected: boolean;
    /** What the last `hello` reported. */
    readonly resume: SessionListResume;
    /**
     * How many times the hub has answered a resume with `gap`.
     *
     * Counted rather than flagged because a gap is an event, not a state: the
     * list is correct again the moment the re-seed lands, so a boolean would
     * have to be cleared by hand and would read as "currently broken". A count
     * that only goes up is something a surface can watch change.
     */
    readonly gaps: number;
}
/**
 * Applies one session-list frame to the list.
 *
 * Returns the same array when nothing changed, so React can bail out of the
 * re-render — an `upsert` whose fields all match is the common case on a busy
 * stream. `hello` and `unhandled` never change the list.
 */
export declare function applySessionListFrame(sessions: ManagedSession[], frame: SessionListFrame): ManagedSession[];
/**
 * Whether a `hello` leaves the client having to re-read `GET /sessions`.
 *
 * Only `replayed` does not: the hub has already delivered every frame
 * published since the id the client sent, so its list is current. `none` is a
 * fresh connect with nothing to replay and `gap` is a resume the hub could not
 * honour, and both leave the list unproven.
 */
export declare function sessionListMustReseed(resume: SessionListResume): boolean;
type Listener = () => void;
export declare class SessionListStore {
    private readonly fetchFn;
    private readonly basePath;
    private readonly listeners;
    /** Counted apart from `listeners`, which collapses two identical functions. */
    private subscribers;
    private snapshot;
    /** The id of the last numbered frame applied, sent back on reconnect. */
    private lastEventId;
    private abort;
    private running;
    private seedInFlight;
    constructor(fetchFn: FetchFn, basePath: string);
    getSnapshot: () => SessionListSnapshot;
    get subscriberCount(): number;
    /** True while a connection is being held open, i.e. while somebody watches. */
    get streaming(): boolean;
    subscribe: (listener: Listener) => (() => void);
    /**
     * Re-read `GET /sessions` now.
     *
     * Still needed with the stream up: a mutation this client just made is
     * confirmed by its own response, and callers refresh to pick up fields the
     * stream does not carry. Concurrent calls share one request.
     */
    refresh: () => Promise<void>;
    /**
     * Merge fields into one session locally, without a round trip.
     *
     * For state the client learns before the list does — the per-session event
     * stream reports a turn ending well before the hub's upsert arrives — and
     * for hydrating a field a list payload omits. The next upsert overwrites it,
     * which is the point: this is a head start on the server's answer, never a
     * substitute for it.
     */
    patch: (sessionId: string, fields: Partial<ManagedSession>) => void;
    private start;
    private stop;
    private run;
    /** Applies a frame and advances the resume cursor past it. */
    private applyFrame;
    private seed;
    private emit;
}
/** One store per (auth'd fetch, base path) — see `sharedInstance` for why the
 *  fetch function owns the table rather than the path alone. */
export declare function sharedSessionList(fetchFn: FetchFn, basePath: string): SessionListStore;
/** Subscribe to the shared session list for as long as the component is mounted. */
export declare function useSharedSessionList(store: SessionListStore): SessionListSnapshot;
export {};
//# sourceMappingURL=sessionListStore.d.ts.map