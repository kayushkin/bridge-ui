import type { FetchFn, BridgeEvent } from './types';
/**
 * Connect to a bridge session's SSE event stream using fetch + ReadableStream.
 * Unlike native EventSource, this supports auth headers and Last-Event-ID.
 */
export declare function connectSSE(fetchFn: FetchFn, basePath: string, sessionId: string, lastEventId?: string, signal?: AbortSignal): AsyncGenerator<BridgeEvent>;
//# sourceMappingURL=bridgeSSE.d.ts.map