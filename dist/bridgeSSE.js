/**
 * Connect to a bridge session's SSE event stream using fetch + ReadableStream.
 * Unlike native EventSource, this supports auth headers and Last-Event-ID.
 */
export async function* connectSSE(fetchFn, basePath, sessionId, lastEventId, signal) {
    const headers = {
        'Accept': 'text/event-stream',
    };
    if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
    }
    const res = await fetchFn(`${basePath}/sessions/${sessionId}/events`, {
        headers,
        signal,
    });
    if (!res.ok) {
        throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`);
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = { type: '', data: '' };
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line === '') {
                    if (currentEvent.data) {
                        try {
                            const data = JSON.parse(currentEvent.data);
                            yield {
                                id: currentEvent.id,
                                type: currentEvent.type || 'message',
                                data,
                            };
                        }
                        catch {
                            // Skip unparseable events
                        }
                    }
                    currentEvent = { type: '', data: '' };
                }
                else if (line.startsWith('event:')) {
                    currentEvent.type = line.slice(6).trim();
                }
                else if (line.startsWith('data:')) {
                    currentEvent.data += (currentEvent.data ? '\n' : '') + line.slice(5).trim();
                }
                else if (line.startsWith('id:')) {
                    currentEvent.id = line.slice(3).trim();
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
/**
 * Reads the hub's `resume` word off a hello payload.
 *
 * An unrecognised or absent word is answered from what this client asked for,
 * because the two cases are not the same claim. Having sent no Last-Event-ID,
 * nothing could have been lost, so `none` is true and `gap` would invent a
 * loss. Having sent one and got back a word this client cannot read, the
 * resume is unproven — `gap` re-seeds and says frames may be missing, which
 * is the honest reading of an answer that cannot be understood.
 */
function resumeOf(raw, requestedLastEventId) {
    if (raw === 'none' || raw === 'replayed' || raw === 'gap')
        return raw;
    return requestedLastEventId ? 'gap' : 'none';
}
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
export async function* connectSessionListSSE(fetchFn, basePath, lastEventId, signal) {
    const headers = { 'Accept': 'text/event-stream' };
    if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
    }
    const res = await fetchFn(`${basePath}/session-events`, {
        headers,
        signal,
    });
    if (!res.ok) {
        throw new Error(`session-list SSE connect failed: ${res.status} ${res.statusText}`);
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = { type: '', data: '' };
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line === '') {
                    if (currentEvent.type) {
                        try {
                            const data = currentEvent.data ? JSON.parse(currentEvent.data) : {};
                            if (currentEvent.type === 'hello') {
                                yield {
                                    type: 'hello',
                                    streamId: data.stream_id ?? '',
                                    resume: resumeOf(data.resume, lastEventId ?? ''),
                                    lastEventId: data.last_event_id ?? '',
                                };
                            }
                            else if (currentEvent.type === 'upsert' && data.session) {
                                yield { type: 'upsert', eventId: currentEvent.id, session: data.session };
                            }
                            else if (currentEvent.type === 'delete' && data.session_id) {
                                yield { type: 'delete', eventId: currentEvent.id, session_id: data.session_id };
                            }
                            else {
                                yield { type: 'unhandled', eventId: currentEvent.id, eventType: currentEvent.type };
                            }
                        }
                        catch {
                            // Skip unparseable frames
                        }
                    }
                    currentEvent = { type: '', data: '' };
                }
                else if (line.startsWith('event:')) {
                    currentEvent.type = line.slice(6).trim();
                }
                else if (line.startsWith('data:')) {
                    currentEvent.data += (currentEvent.data ? '\n' : '') + line.slice(5).trim();
                }
                else if (line.startsWith('id:')) {
                    currentEvent.id = line.slice(3).trim();
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
//# sourceMappingURL=bridgeSSE.js.map