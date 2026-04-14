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
//# sourceMappingURL=bridgeSSE.js.map