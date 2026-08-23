import type { FetchFn, BridgeEvent, ManagedSession } from './types';
/**
 * What the hub could give a reconnecting client, from its `hello` frame.
 *
 * Three values rather than a bool because "fresh connect" and "you asked to
 * resume and I could not" both leave the client re-seeding, but only the
 * second means frames were lost and something on screen may have been wrong.
 */
export type SessionListResume = 'none' | 'replayed' | 'gap';
/**
 * Frame on the global session-list stream (`GET /session-events`).
 *
 * `unhandled` is not padding. The hub numbers every frame it publishes,
 * including kinds this client does not act on (`signal`), so a reader that
 * only recorded the ids of frames it understood would let its resume cursor
 * fall behind the stream and ask to be replayed frames it has already seen.
 * Every numbered frame is yielded; `eventId` is what the caller sends back.
 */
export type SessionListFrame = {
    type: 'hello';
    streamId: string;
    resume: SessionListResume;
    lastEventId: string;
} | {
    type: 'upsert';
    eventId?: string;
    session: ManagedSession;
} | {
    type: 'delete';
    eventId?: string;
    session_id: string;
} | {
    type: 'unhandled';
    eventId?: string;
    eventType: string;
};
/**
 * Connect to a bridge session's SSE event stream using fetch + ReadableStream.
 * Unlike native EventSource, this supports auth headers and Last-Event-ID.
 */
export declare function connectSSE(fetchFn: FetchFn, basePath: string, sessionId: string, lastEventId?: string, signal?: AbortSignal): AsyncGenerator<BridgeEvent>;
/**
 * Connect to the global session-list event stream. Yields one frame per
 * lifecycle change (upsert / delete) plus an initial 'hello' on connect.
 * Mirrors connectSSE's parsing — kept separate so the per-session and global
 * streams have explicit, type-safe entrypoints.
 *
 * Pass the id of the last frame seen to resume: the hub replays exactly what
 * was published after it, and says in `hello` whether it could. Without that
 * the client re-seeds on every reconnect and an upsert that landed while the
 * connection was down is gone for good.
 */
export declare function connectSessionListSSE(fetchFn: FetchFn, basePath: string, lastEventId?: string, signal?: AbortSignal): AsyncGenerator<SessionListFrame>;
//# sourceMappingURL=bridgeSSE.d.ts.map