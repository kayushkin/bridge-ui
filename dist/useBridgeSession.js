import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from './context';
import { connectSSE } from './bridgeSSE';
function emptyBuffer() {
    return { content: '', thinking: '', tools: [], meta: {}, done: false };
}
// --- Normalize messages from /messages API ---
// The server returns MaterializedMessage with tools at the top level and meta as
// a ResultEvent. Merge top-level tools into meta for uniform access.
function normalizeMessage(m, index, sessionId) {
    const result = {
        ...m,
        id: m.id ?? `hist-${index}`,
        sessionId: m.sessionId ?? sessionId,
    };
    // Pull top-level tools into meta.tools for uniform access
    if (m.tools?.length) {
        result.meta = { ...result.meta, tools: m.tools, toolCalls: m.tools.length };
    }
    return result;
}
// --- Debounce helper ---
function debounce(fn, ms) {
    let timer = null;
    const debounced = ((...args) => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, ms);
    });
    debounced.cancel = () => { if (timer) {
        clearTimeout(timer);
        timer = null;
    } };
    return debounced;
}
// --- Hook ---
export function useBridgeSession() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [activity, setActivity] = useState({ kind: 'idle' });
    const wasInterrupted = useRef(false);
    const sseAbort = useRef(null);
    const lastEventId = useRef(undefined);
    const streamBuffer = useRef(emptyBuffer());
    const streamMsgId = useRef(null);
    const rafId = useRef(0);
    const activeSessionRef = useRef(null);
    const historyLoadId = useRef(0);
    // --- Session refresh (debounced) ---
    const refreshSessionsImpl = useCallback(async () => {
        try {
            const res = await fetchFn(`${basePath}/sessions`);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
                setConnected(true);
            }
            else {
                setConnected(false);
            }
        }
        catch {
            setConnected(false);
        }
    }, [fetchFn, basePath]);
    const debouncedRefresh = useMemo(() => debounce(refreshSessionsImpl, 500), [refreshSessionsImpl]);
    const refreshSessions = useCallback(() => {
        debouncedRefresh();
    }, [debouncedRefresh]);
    useEffect(() => { refreshSessionsImpl(); }, [refreshSessionsImpl]);
    // --- Derived state ---
    const activeSession = sessions.find(s => s.bridge_id === activeSessionId) || null;
    activeSessionRef.current = activeSession;
    const uiState = useMemo(() => {
        if (!activeSession)
            return 'empty';
        if (activeSession.state === 'running')
            return 'running';
        if (activeSession.state === 'idle' && wasInterrupted.current)
            return 'paused';
        if (activeSession.state === 'idle')
            return 'idle';
        return activeSession.state;
    }, [activeSession]);
    // --- SSE flush ---
    const flushStream = useCallback(() => {
        rafId.current = 0;
        const msgId = streamMsgId.current;
        if (!msgId)
            return;
        const buf = streamBuffer.current;
        const snapshot = { ...buf };
        buf.content = '';
        buf.thinking = '';
        setMessages(prev => prev.map(m => {
            if (m.id !== msgId)
                return m;
            const updated = { ...m };
            if (snapshot.content)
                updated.content = m.content + snapshot.content;
            if (snapshot.thinking)
                updated.thinking = (m.thinking || '') + snapshot.thinking;
            if (snapshot.tools.length > 0) {
                const tools = [...(m.meta?.tools || []), ...snapshot.tools];
                updated.meta = { ...m.meta, tools, toolCalls: tools.length };
                buf.tools = [];
            }
            if (Object.keys(snapshot.meta).length > 0) {
                updated.meta = { ...updated.meta, ...snapshot.meta };
            }
            if (snapshot.done) {
                updated.done = true;
            }
            return updated;
        }));
    }, []);
    const scheduleFlush = useCallback(() => {
        if (!rafId.current) {
            rafId.current = requestAnimationFrame(flushStream);
        }
    }, [flushStream]);
    // --- SSE connection ---
    const closeSSE = useCallback(() => {
        if (sseAbort.current) {
            sseAbort.current.abort();
            sseAbort.current = null;
        }
        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = 0;
        }
    }, []);
    const startSSE = useCallback((sessionId) => {
        closeSSE();
        const abort = new AbortController();
        sseAbort.current = abort;
        (async () => {
            try {
                const events = connectSSE(fetchFn, basePath, sessionId, lastEventId.current, abort.signal);
                for await (const event of events) {
                    if (event.id)
                        lastEventId.current = event.id;
                    handleSSEEvent(event, sessionId);
                }
            }
            catch (err) {
                if (abort.signal.aborted)
                    return;
                if (streamMsgId.current) {
                    streamBuffer.current.done = true;
                    scheduleFlush();
                    streamMsgId.current = null;
                }
                setActivity({ kind: 'idle' });
            }
        })();
        function handleSSEEvent(event, sessId) {
            const { type, data } = event;
            switch (type) {
                case 'stream': {
                    const delta = data.stream?.delta;
                    if (!delta)
                        return;
                    ensureStreamingMsg(sessId);
                    if (delta.type === 'text_delta') {
                        streamBuffer.current.content += delta.text || '';
                        setActivity({ kind: 'streaming' });
                    }
                    else if (delta.type === 'thinking_delta') {
                        streamBuffer.current.thinking += delta.thinking || '';
                        setActivity({ kind: 'thinking' });
                    }
                    scheduleFlush();
                    break;
                }
                case 'thinking': {
                    const text = data.thinking?.text || '';
                    if (!text)
                        return;
                    ensureStreamingMsg(sessId);
                    streamBuffer.current.thinking += text;
                    setActivity({ kind: 'thinking' });
                    scheduleFlush();
                    break;
                }
                case 'tool_call': {
                    const tc = data.tool_call;
                    if (!tc)
                        return;
                    ensureStreamingMsg(sessId);
                    const name = tc.name || '';
                    streamBuffer.current.tools.push({
                        tool: name,
                        input: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input),
                    });
                    setActivity({ kind: 'tool', name });
                    scheduleFlush();
                    break;
                }
                case 'tool_result': {
                    const tr = data.tool_result;
                    if (!tr)
                        return;
                    setMessages(prev => {
                        const msgId = streamMsgId.current;
                        if (!msgId)
                            return prev;
                        return prev.map(m => {
                            if (m.id !== msgId)
                                return m;
                            const tools = [...(m.meta?.tools || []), ...streamBuffer.current.tools];
                            streamBuffer.current.tools = [];
                            for (let i = tools.length - 1; i >= 0; i--) {
                                if (tools[i].tool === tr.name && !tools[i].output) {
                                    tools[i] = { ...tools[i], output: tr.output, error: tr.is_error };
                                    break;
                                }
                            }
                            return { ...m, meta: { ...m.meta, tools, toolCalls: tools.length } };
                        });
                    });
                    setActivity({ kind: 'streaming' });
                    break;
                }
                case 'result': {
                    const result = data.result;
                    if (!result)
                        return;
                    if (rafId.current) {
                        cancelAnimationFrame(rafId.current);
                        rafId.current = 0;
                    }
                    flushStream();
                    // result is a ResultEvent — use it directly as meta.
                    const meta = {
                        ...result,
                        rawStats: data,
                    };
                    setMessages(prev => {
                        const msgId = streamMsgId.current;
                        if (!msgId)
                            return prev;
                        return prev.map(m => {
                            if (m.id !== msgId)
                                return m;
                            const content = result.text || m.content;
                            return { ...m, content, meta: { ...m.meta, ...meta }, done: true };
                        });
                    });
                    streamMsgId.current = null;
                    streamBuffer.current = emptyBuffer();
                    setActivity({ kind: 'idle' });
                    wasInterrupted.current = false;
                    refreshSessions();
                    break;
                }
                case 'system': {
                    const sys = data.system;
                    if (sys?.subtype === 'harness_id_set') {
                        // The harness has reported its canonical session ID.
                        // Refresh sessions so the UI picks up the harness_id field.
                        refreshSessionsImpl();
                    }
                    else if (sys?.subtype === 'retry') {
                        setError(`Retrying (attempt ${sys.attempt}/${sys.max_retries})...`);
                    }
                    break;
                }
                case 'error': {
                    const errData = data.error;
                    setError(errData?.message || 'Stream error');
                    if (streamMsgId.current) {
                        streamBuffer.current.done = true;
                        scheduleFlush();
                        streamMsgId.current = null;
                    }
                    setActivity({ kind: 'idle' });
                    break;
                }
                case 'session_state': {
                    const state = data.state?.state;
                    if (state === 'idle' && !wasInterrupted.current) {
                        setActivity({ kind: 'idle' });
                        streamMsgId.current = null;
                        streamBuffer.current = emptyBuffer();
                    }
                    else if (state === 'running') {
                        wasInterrupted.current = false;
                    }
                    else if (state === 'completed') {
                        loadHistory(sessId);
                        setActivity({ kind: 'idle' });
                        streamMsgId.current = null;
                        streamBuffer.current = emptyBuffer();
                    }
                    refreshSessions();
                    break;
                }
                case 'close': {
                    streamMsgId.current = null;
                    streamBuffer.current = emptyBuffer();
                    setActivity({ kind: 'idle' });
                    closeSSE();
                    refreshSessions();
                    break;
                }
            }
        }
        function ensureStreamingMsg(sessId) {
            if (streamMsgId.current)
                return;
            const id = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            streamMsgId.current = id;
            streamBuffer.current = emptyBuffer();
            const newMsg = {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                sessionId: sessId,
            };
            setMessages(prev => [...prev, newMsg]);
        }
    }, [fetchFn, basePath, closeSSE, scheduleFlush, flushStream, refreshSessions]);
    // --- History loading ---
    const loadHistory = useCallback(async (sessionId) => {
        const loadId = ++historyLoadId.current;
        setLoadingHistory(true);
        try {
            const res = await fetchFn(`${basePath}/sessions/${sessionId}/messages`);
            if (!res.ok) {
                setError(`History load failed: ${res.status} ${res.statusText}`);
                return;
            }
            const msgs = await res.json();
            if (loadId !== historyLoadId.current)
                return;
            if (msgs)
                setMessages(msgs.map((m, i) => normalizeMessage(m, i, sessionId)));
        }
        catch (err) {
            setError(`History load failed: ${err}`);
        }
        finally {
            if (loadId === historyLoadId.current)
                setLoadingHistory(false);
        }
    }, [fetchFn, basePath]);
    // --- Session selection ---
    const selectSession = useCallback((id) => {
        closeSSE();
        streamMsgId.current = null;
        streamBuffer.current = emptyBuffer();
        wasInterrupted.current = false;
        setError(null);
        setActivity({ kind: 'idle' });
        if (!id) {
            setActiveSessionId(null);
            setMessages([]);
            return;
        }
        setActiveSessionId(id);
        setMessages([]);
        lastEventId.current = undefined;
        (async () => {
            await loadHistory(id);
            const session = sessions.find(s => s.bridge_id === id);
            if (session?.state === 'running') {
                startSSE(id);
            }
            if (session?.state === 'idle') {
                wasInterrupted.current = false;
            }
        })();
    }, [closeSSE, loadHistory, startSSE, sessions]);
    useEffect(() => {
        if (activeSession?.state === 'running' && !sseAbort.current) {
            startSSE(activeSession.bridge_id);
        }
    }, [activeSession?.state, activeSession?.bridge_id, startSSE]);
    // --- Visibility change reconnection ---
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible' && activeSessionId) {
                refreshSessionsImpl();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [activeSessionId, refreshSessionsImpl]);
    // --- Actions ---
    const createSession = useCallback(async (opts) => {
        try {
            const clientId = opts.clientId ?? `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const body = {
                harness: opts.harness,
                display_name: opts.displayName,
                agent_id: opts.agentId,
                instance_id: opts.instanceId,
                auto_start: false,
                client_id: clientId,
            };
            const res = await fetchFn(`${basePath}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                setError(`Failed to create session: ${res.statusText}`);
                return null;
            }
            const sess = await res.json();
            await refreshSessionsImpl();
            selectSession(sess.bridge_id);
            return sess;
        }
        catch (err) {
            setError(`Failed to create session: ${err}`);
            return null;
        }
    }, [fetchFn, basePath, refreshSessionsImpl, selectSession]);
    const send = useCallback(async (text) => {
        if (!activeSessionId || !text.trim())
            return;
        const userMsg = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
            sessionId: activeSessionId,
            done: true,
        };
        setMessages(prev => [...prev, userMsg]);
        setError(null);
        wasInterrupted.current = false;
        try {
            const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text }),
            });
            if (!res.ok) {
                const err = await res.text();
                setError(`Send failed: ${err}`);
                return;
            }
            // Reset lastEventId so SSE connects without Last-Event-ID.
            // This makes the server use ListCurrentTurnEventsWithIDs (turn-aware
            // replay) instead of ListEventsSinceID (which replays everything
            // including user_message events from the previous turn boundary).
            lastEventId.current = undefined;
            startSSE(activeSessionId);
            refreshSessions();
        }
        catch (err) {
            setError(`Send failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, activeSession, startSSE, refreshSessions]);
    const interrupt = useCallback(async () => {
        if (!activeSessionId)
            return;
        try {
            await fetchFn(`${basePath}/sessions/${activeSessionId}/interrupt`, { method: 'POST' });
            wasInterrupted.current = true;
            if (streamMsgId.current) {
                streamBuffer.current.done = true;
                flushStream();
                streamMsgId.current = null;
            }
            setActivity({ kind: 'idle' });
            refreshSessions();
        }
        catch (err) {
            setError(`Interrupt failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, flushStream, refreshSessions]);
    const resume = useCallback(async () => {
        if (!activeSessionId)
            return;
        try {
            const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/resume`, { method: 'POST' });
            if (!res.ok) {
                setError(`Resume failed: ${res.statusText}`);
                return;
            }
            wasInterrupted.current = false;
            startSSE(activeSessionId);
            refreshSessions();
        }
        catch (err) {
            setError(`Resume failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions]);
    const stopSession = useCallback(async () => {
        if (!activeSessionId)
            return;
        try {
            await fetchFn(`${basePath}/sessions/${activeSessionId}/stop`, { method: 'POST' });
            closeSSE();
            if (streamMsgId.current) {
                streamBuffer.current.done = true;
                flushStream();
                streamMsgId.current = null;
            }
            wasInterrupted.current = false;
            setActivity({ kind: 'idle' });
            refreshSessions();
        }
        catch (err) {
            setError(`Stop failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, closeSSE, flushStream, refreshSessions]);
    const compact = useCallback(async (summary) => {
        if (!activeSessionId)
            return;
        try {
            const body = {};
            if (summary)
                body.summary = summary;
            await fetchFn(`${basePath}/sessions/${activeSessionId}/compact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        }
        catch (err) {
            setError(`Compact failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId]);
    const forkSession = useCallback(async (displayName) => {
        if (!activeSessionId)
            return;
        try {
            const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/fork`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: displayName || '',
                    client_id: `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                }),
            });
            if (!res.ok) {
                setError(`Fork failed: ${res.statusText}`);
                return;
            }
            const forked = await res.json();
            await refreshSessionsImpl();
            selectSession(forked.bridge_id);
        }
        catch (err) {
            setError(`Fork failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, refreshSessionsImpl, selectSession]);
    const renameSession = useCallback(async (displayName) => {
        if (!activeSessionId)
            return;
        try {
            await fetchFn(`${basePath}/sessions/${activeSessionId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_name: displayName }),
            });
            await refreshSessionsImpl();
        }
        catch {
            // Rename endpoint may not exist — callers can use prefs as fallback
        }
    }, [fetchFn, basePath, activeSessionId, refreshSessionsImpl]);
    const sendConfig = useCallback(async (config) => {
        if (!activeSessionId)
            return;
        try {
            await fetchFn(`${basePath}/sessions/${activeSessionId}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
        }
        catch (err) {
            setError(`Config update failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId]);
    // Cleanup on unmount
    useEffect(() => () => {
        closeSSE();
        debouncedRefresh.cancel();
    }, [closeSSE, debouncedRefresh]);
    return {
        sessions,
        activeSession,
        messages,
        uiState,
        activity,
        connected,
        error,
        loadingHistory,
        createSession,
        selectSession,
        send,
        interrupt,
        resume,
        stop: stopSession,
        compact,
        fork: forkSession,
        renameSession,
        sendConfig,
        refreshSessions,
    };
}
//# sourceMappingURL=useBridgeSession.js.map