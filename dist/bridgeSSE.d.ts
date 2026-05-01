import type { FetchFn, BridgeEvent, ManagedSession } from './types';
/** Frame on the global session-list stream (`GET /session-events`). */
export type SessionListFrame = {
    type: 'hello';
} | {
    type: 'upsert';
    session: ManagedSession;
} | {
    type: 'delete';
    bridge_id: string;
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
 */
export declare function connectSessionListSSE(fetchFn: FetchFn, basePath: string, signal?: AbortSignal): AsyncGenerator<SessionListFrame>;
//# sourceMappingURL=bridgeSSE.d.ts.map