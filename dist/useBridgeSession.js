import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from './context';
import { connectSSE, connectSessionListSSE } from './bridgeSSE';
// --- Event envelope ---
//
// Unified shape for both live SSE events and history-replayed events. History
// events arrive as bare `msg.Event` objects (with `event_id` injected by
// log-store); live events arrive in the SSE BridgeEvent envelope where the
// stored event is under `data` and the SSE `id:` line carries the row id.
function wrapHistoryEvent(ev) {
    const id = typeof ev.event_id === 'number' ? String(ev.event_id) : undefined;
    return {
        id,
        type: ev.type || 'message',
        data: ev,
    };
}
function eventIdOf(ev) {
    if (typeof ev.data.event_id === 'number')
        return ev.data.event_id;
    if (ev.id)
        return Number(ev.id) || 0;
    return 0;
}
// --- LogRow reducer ---
//
// Rule: an event only coalesces with an existing row when the group key
// matches. Group key = `${message_id}_${kind}` so different event kinds under
// the same message_id stay as separate rows (a turn's text, thinking, and
// individual tool calls all render as their own rows). Tool calls/results
// pair by `tool_${tool_id}` so a call and its result merge regardless of
// which assistant bubble they appeared in. Events with no group key stand
// alone, keyed by their event_id. Dedup is per-event_id.
function actorFor(eventType) {
    switch (eventType) {
        case 'user_message':
            return 'user';
        case 'system':
        case 'session_state':
        case 'session_info':
            return 'system';
        default:
            return 'assistant';
    }
}
function rowKindOf(ev) {
    switch (ev.type) {
        case 'user_message': return 'user_message';
        case 'stream': {
            const dt = ev.data.stream?.delta?.type;
            if (dt === 'thinking_delta')
                return 'thinking';
            if (dt === 'text_delta')
                return 'text';
            return 'stream';
        }
        case 'block': {
            const bt = ev.data.block?.block?.type;
            if (bt === 'thinking')
                return 'thinking';
            if (bt === 'text')
                return 'text';
            return 'block';
        }
        case 'thinking': return 'thinking';
        case 'tool_call':
        case 'tool_result': return 'tool';
        case 'result': return 'result';
        case 'error': return 'error';
        case 'system': return 'system';
        case 'session_state': return 'session_state';
        case 'session_info': return 'session_info';
        case 'plan': return 'plan';
        case 'approval': return 'approval';
        default: return 'other';
    }
}
function groupKeyFor(ev) {
    const kind = rowKindOf(ev);
    // tool_call / tool_result pair by tool_id — independent of which assistant
    // bubble's message_id they arrived under.
    if (kind === 'tool') {
        const toolId = ev.data.tool_call?.tool_id || ev.data.tool_result?.tool_id;
        return toolId ? `tool_${toolId}` : null;
    }
    const msgId = ev.data.message_id;
    if (!msgId)
        return null;
    return `${msgId}_${kind}`;
}
function freshRow(ev, gKey) {
    const msgId = ev.data.message_id;
    const evId = eventIdOf(ev);
    return {
        key: gKey || `evt_${evId}`,
        clientId: undefined,
        clientRequestId: ev.data.client_request_id,
        turnId: ev.data.turn_id,
        messageId: msgId,
        harnessMessageId: ev.data.harness_message_id,
        eventIds: [],
        actor: actorFor(ev.type),
        kind: rowKindOf(ev),
        eventType: ev.type,
        subtype: subtypeOf(ev),
        timestamp: ev.data.timestamp || new Date().toISOString(),
        events: [],
    };
}
function subtypeOf(ev) {
    if (ev.type === 'system')
        return ev.data.system?.subtype;
    if (ev.type === 'thinking')
        return ev.data.thinking?.subtype;
    if (ev.type === 'block')
        return ev.data.block?.block?.type;
    return undefined;
}
function applyDelta(row, ev) {
    const events = [...row.events, ev.data];
    const base = { ...row, events };
    switch (ev.type) {
        case 'user_message': {
            return { ...base, text: ev.data.result?.text ?? row.text, done: true };
        }
        case 'stream': {
            const d = ev.data.stream?.delta;
            let next = base;
            if (d?.type === 'text_delta')
                next = { ...next, text: (row.text || '') + (d.text || '') };
            else if (d?.type === 'thinking_delta')
                next = { ...next, thinking: (row.thinking || '') + (d.thinking || '') };
            return next;
        }
        case 'block': {
            const b = ev.data.block?.block;
            if (!b)
                return base;
            if (b.type === 'text' && b.text_block) {
                return { ...base, text: (row.text || '') + (b.text_block.text || '') };
            }
            if (b.type === 'thinking' && b.thinking_block) {
                return { ...base, thinking: (row.thinking || '') + (b.thinking_block.text || '') };
            }
            return base;
        }
        case 'thinking': {
            return { ...base, thinking: (row.thinking || '') + (ev.data.thinking?.text || '') };
        }
        case 'tool_call': {
            const tc = ev.data.tool_call;
            if (!tc)
                return base;
            const tools = [...(row.tools || []), { tool_id: tc.tool_id || '', tool: tc.name || '', input: tc.input }];
            return { ...base, tools };
        }
        case 'tool_result': {
            const tr = ev.data.tool_result;
            if (!tr)
                return base;
            const tools = (row.tools || []).slice();
            // Match by tool_id (canonical pairing) and fall back to name for pre-id events.
            let idx = tr.tool_id ? tools.findIndex(t => t.tool_id === tr.tool_id) : -1;
            if (idx === -1) {
                for (let i = tools.length - 1; i >= 0; i--) {
                    if (tools[i].tool === tr.name && !tools[i].output) {
                        idx = i;
                        break;
                    }
                }
            }
            if (idx !== -1) {
                tools[idx] = { ...tools[idx], output: tr.output, error: tr.is_error };
            }
            return { ...base, tools };
        }
        case 'result': {
            const result = ev.data.result;
            const meta = { ...(result || {}), rawStats: ev.data };
            return {
                ...base,
                text: result?.text || row.text,
                usage: result?.usage ?? row.usage,
                meta: { ...row.meta, ...meta },
                done: true,
            };
        }
        case 'error': {
            return { ...base, errorMessage: ev.data.error?.message || 'error', done: true };
        }
        case 'system': {
            const sys = ev.data.system;
            if (!sys)
                return base;
            const { subtype, message, ...rest } = sys;
            void subtype;
            return {
                ...base,
                toolUseId: sys.tool_use_id || row.toolUseId,
                systemMessage: message,
                systemFields: Object.keys(rest).length > 0 ? rest : undefined,
                done: true,
            };
        }
        case 'session_state': {
            const st = ev.data.state;
            if (!st)
                return base;
            return {
                ...base,
                stateTransition: { to: st.state || '', from: st.previous, reason: st.reason },
                done: true,
            };
        }
        case 'session_info': {
            const info = ev.data.info;
            return { ...base, sessionInfo: info, done: true };
        }
        default:
            return base;
    }
}
function applyEventToRows(rows, ev) {
    const evId = eventIdOf(ev);
    const gKey = groupKeyFor(ev);
    if (gKey) {
        const idx = rows.findIndex(r => r.key === gKey);
        if (idx === -1) {
            const fresh = freshRow(ev, gKey);
            const updated = applyDelta(fresh, ev);
            updated.eventIds = evId ? [evId] : [];
            return [...rows, updated];
        }
        const existing = rows[idx];
        if (evId && existing.eventIds.includes(evId))
            return rows;
        const updated = applyDelta(existing, ev);
        updated.key = gKey;
        updated.eventIds = evId ? [...existing.eventIds, evId] : existing.eventIds;
        if (!existing.harnessMessageId && ev.data.harness_message_id) {
            updated.harnessMessageId = ev.data.harness_message_id;
        }
        if (!existing.clientRequestId && ev.data.client_request_id) {
            updated.clientRequestId = ev.data.client_request_id;
        }
        if (!existing.turnId && ev.data.turn_id) {
            updated.turnId = ev.data.turn_id;
        }
        if (!existing.messageId && ev.data.message_id) {
            updated.messageId = ev.data.message_id;
        }
        const next = rows.slice();
        next[idx] = updated;
        return next;
    }
    // Standalone row, keyed by event_id. Dedup against its own eventIds[0].
    if (evId && rows.some(r => r.eventIds[0] === evId))
        return rows;
    const fresh = freshRow(ev, null);
    const updated = applyDelta(fresh, ev);
    updated.eventIds = evId ? [evId] : [];
    return [...rows, updated];
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
// --- Interrupted-session persistence ---
//
// `paused` is a frontend-only refinement of the canonical `idle` state — it
// means "the user interrupted this session's last turn." We persist the set
// of interrupted bridge_ids in localStorage so the marker survives reloads
// and tab switches, and so the sidebar can show a paused dot for any session
// (not just the active one).
const INTERRUPTED_KEY = 'bridge-ui-interrupted-sessions';
function loadInterruptedIds() {
    try {
        const raw = localStorage.getItem(INTERRUPTED_KEY);
        if (!raw)
            return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    }
    catch {
        return new Set();
    }
}
function saveInterruptedIds(s) {
    try {
        localStorage.setItem(INTERRUPTED_KEY, JSON.stringify([...s]));
    }
    catch { /* ignore */ }
}
function deriveSessionUIState(session, interrupted) {
    if (session.state === 'running')
        return 'running';
    if (session.state === 'idle' && interrupted.has(session.bridge_id))
        return 'paused';
    if (session.state === 'idle')
        return 'idle';
    return session.state;
}
// --- Hook ---
export function useBridgeSession() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [logRows, setLogRows] = useState([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [activity, setActivity] = useState({ kind: 'idle' });
    const [compacting, setCompacting] = useState(false);
    const [interruptedIds, setInterruptedIds] = useState(loadInterruptedIds);
    const sseAbort = useRef(null);
    const lastEventId = useRef(undefined);
    const activeSessionRef = useRef(null);
    const historyLoadId = useRef(0);
    const sessionsRef = useRef([]);
    sessionsRef.current = sessions;
    const activeSessionIdRef = useRef(null);
    activeSessionIdRef.current = activeSessionId;
    const interruptedIdsRef = useRef(interruptedIds);
    interruptedIdsRef.current = interruptedIds;
    const compactingTimer = useRef(null);
    const clearCompacting = useCallback(() => {
        if (compactingTimer.current) {
            clearTimeout(compactingTimer.current);
            compactingTimer.current = null;
        }
        setCompacting(false);
    }, []);
    const markInterrupted = useCallback((id) => {
        setInterruptedIds(prev => {
            if (prev.has(id))
                return prev;
            const next = new Set(prev);
            next.add(id);
            saveInterruptedIds(next);
            return next;
        });
    }, []);
    const unmarkInterrupted = useCallback((id) => {
        setInterruptedIds(prev => {
            if (!prev.has(id))
                return prev;
            const next = new Set(prev);
            next.delete(id);
            saveInterruptedIds(next);
            return next;
        });
    }, []);
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
    // Global session-list SSE subscription. The initial fetch above seeds the
    // list; this stream then patches it in place on every server-side mutation
    // (create / state / rename / folder / delete), so the sidebar stays live
    // without re-fetching `/sessions`. Reconnects with backoff on disconnect.
    useEffect(() => {
        let cancelled = false;
        let abort = null;
        let retryDelay = 1000;
        const run = async () => {
            while (!cancelled) {
                abort = new AbortController();
                try {
                    const stream = connectSessionListSSE(fetchFn, basePath, abort.signal);
                    for await (const frame of stream) {
                        if (cancelled)
                            return;
                        if (frame.type === 'hello') {
                            retryDelay = 1000;
                            continue;
                        }
                        if (frame.type === 'upsert') {
                            const incoming = frame.session;
                            setSessions(prev => {
                                const i = prev.findIndex(s => s.bridge_id === incoming.bridge_id);
                                if (i === -1)
                                    return [incoming, ...prev];
                                const next = prev.slice();
                                next[i] = { ...next[i], ...incoming };
                                return next;
                            });
                        }
                        else if (frame.type === 'delete') {
                            setSessions(prev => prev.filter(s => s.bridge_id !== frame.bridge_id));
                        }
                    }
                }
                catch {
                    if (cancelled || abort?.signal.aborted)
                        return;
                }
                if (cancelled)
                    return;
                await new Promise(r => setTimeout(r, retryDelay));
                retryDelay = Math.min(retryDelay * 2, 30000);
            }
        };
        run();
        return () => {
            cancelled = true;
            abort?.abort();
        };
    }, [fetchFn, basePath]);
    // --- Derived state ---
    const activeSession = sessions.find(s => s.bridge_id === activeSessionId) || null;
    activeSessionRef.current = activeSession;
    const patchSessionState = useCallback((sessionId, state) => {
        setSessions(prev => prev.map(s => s.bridge_id === sessionId ? { ...s, state } : s));
    }, []);
    const uiState = useMemo(() => {
        if (!activeSession)
            return 'empty';
        return deriveSessionUIState(activeSession, interruptedIds);
    }, [activeSession, interruptedIds]);
    const getSessionUIState = useCallback((session) => deriveSessionUIState(session, interruptedIds), [interruptedIds]);
    // Drop interrupted markers for sessions that are no longer in `idle` or no
    // longer present in the sessions list. Anything that's now running, completed,
    // errored, or deleted shouldn't carry a pause marker — when it next reaches
    // idle, that's a fresh idle, not a paused-from-before.
    useEffect(() => {
        if (sessions.length === 0)
            return;
        setInterruptedIds(prev => {
            if (prev.size === 0)
                return prev;
            const next = new Set();
            for (const s of sessions) {
                if (s.state === 'idle' && prev.has(s.bridge_id))
                    next.add(s.bridge_id);
            }
            if (next.size === prev.size) {
                let same = true;
                for (const id of prev)
                    if (!next.has(id)) {
                        same = false;
                        break;
                    }
                if (same)
                    return prev;
            }
            saveInterruptedIds(next);
            return next;
        });
    }, [sessions]);
    // --- SSE connection ---
    const closeSSE = useCallback(() => {
        if (sseAbort.current) {
            sseAbort.current.abort();
            sseAbort.current = null;
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
                    handleSSEEvent(event);
                }
            }
            catch {
                if (abort.signal.aborted)
                    return;
                setActivity({ kind: 'idle' });
            }
        })();
        function handleSSEEvent(event) {
            const { type, data } = event;
            const sessId = sessionId;
            setLogRows(prev => applyEventToRows(prev, event));
            switch (type) {
                case 'stream': {
                    if (data.stream?.delta?.type === 'thinking_delta')
                        setActivity({ kind: 'thinking' });
                    else
                        setActivity({ kind: 'streaming' });
                    break;
                }
                case 'block': {
                    if (data.block?.block?.type === 'thinking')
                        setActivity({ kind: 'thinking' });
                    else
                        setActivity({ kind: 'streaming' });
                    break;
                }
                case 'thinking':
                    setActivity({ kind: 'thinking' });
                    break;
                case 'tool_call': {
                    setActivity({ kind: 'tool', name: data.tool_call?.name || '' });
                    break;
                }
                case 'tool_result':
                    setActivity({ kind: 'streaming' });
                    break;
                case 'result':
                    setActivity({ kind: 'idle' });
                    unmarkInterrupted(sessId);
                    patchSessionState(sessId, 'completed');
                    refreshSessions();
                    break;
                case 'system': {
                    const sys = data.system;
                    if (sys?.subtype === 'harness_id_set')
                        refreshSessionsImpl();
                    else if (sys?.subtype === 'display_name_changed')
                        refreshSessionsImpl();
                    else if (sys?.subtype === 'retry')
                        setError(`Retrying (attempt ${sys.attempt}/${sys.max_retries})...`);
                    else if (sys?.subtype === 'compact_boundary' || sys?.subtype === 'compact_ack')
                        clearCompacting();
                    break;
                }
                case 'session_info':
                    refreshSessionsImpl();
                    break;
                case 'error': {
                    setError(data.error?.message || 'Stream error');
                    setActivity({ kind: 'idle' });
                    patchSessionState(sessId, 'error');
                    break;
                }
                case 'session_state': {
                    const state = data.state?.state;
                    if (state === 'idle' && !interruptedIdsRef.current.has(sessId))
                        setActivity({ kind: 'idle' });
                    else if (state === 'running')
                        unmarkInterrupted(sessId);
                    else if (state === 'completed') {
                        setActivity({ kind: 'idle' });
                        unmarkInterrupted(sessId);
                    }
                    if (state)
                        patchSessionState(sessId, state);
                    refreshSessions();
                    break;
                }
                case 'close':
                    setActivity({ kind: 'idle' });
                    patchSessionState(sessId, 'completed');
                    closeSSE();
                    refreshSessions();
                    break;
            }
        }
    }, [fetchFn, basePath, closeSSE, refreshSessions, refreshSessionsImpl, patchSessionState, unmarkInterrupted, clearCompacting]);
    // --- History loading ---
    //
    // Fetch raw events from /history (each event JSON has event_id injected by
    // log-store), replay through the reducer to build logRows, and capture the
    // max event_id so SSE reconnect resumes cleanly.
    const loadHistory = useCallback(async (sessionId) => {
        const loadId = ++historyLoadId.current;
        setLoadingHistory(true);
        try {
            const res = await fetchFn(`${basePath}/sessions/${sessionId}/history`);
            if (!res.ok) {
                setError(`History load failed: ${res.status} ${res.statusText}`);
                return;
            }
            const raws = await res.json();
            // Two guards: bail if a newer load started, or if the user has navigated
            // to a different session entirely (so we don't clobber that session's
            // rows with this one's history).
            if (loadId !== historyLoadId.current)
                return;
            if (activeSessionIdRef.current !== sessionId)
                return;
            let rows = [];
            let maxEventId = 0;
            for (const raw of raws || []) {
                const ev = wrapHistoryEvent(raw);
                rows = applyEventToRows(rows, ev);
                const id = eventIdOf(ev);
                if (id > maxEventId)
                    maxEventId = id;
            }
            setLogRows(rows);
            lastEventId.current = maxEventId > 0 ? String(maxEventId) : undefined;
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
        setError(null);
        setActivity({ kind: 'idle' });
        clearCompacting();
        if (!id) {
            setActiveSessionId(null);
            setLogRows([]);
            return;
        }
        // Only wipe rows when actually switching sessions. A re-select of the
        // current session (e.g. an effect re-firing after a sessions-list refresh)
        // must not blank the screen — loadHistory will atomically replace rows
        // once it resolves.
        const switching = activeSessionIdRef.current !== id;
        setActiveSessionId(id);
        activeSessionIdRef.current = id;
        if (switching) {
            setLogRows([]);
            lastEventId.current = undefined;
        }
        ;
        (async () => {
            // If this bridge instance hasn't seen the session yet (e.g. it was
            // just created via a *different* useBridgeSession instance), refresh
            // the list so derived state — activeSession, machine, harness info —
            // populates immediately instead of waiting for the next event.
            if (!sessionsRef.current.find(s => s.bridge_id === id)) {
                await refreshSessionsImpl();
            }
            await loadHistory(id);
            // Read the latest sessions list at resolution time, not the value
            // captured when this callback was created — the session may have been
            // freshly created and not yet present in the closure snapshot.
            const session = sessionsRef.current.find(s => s.bridge_id === id);
            if (session?.state === 'running') {
                startSSE(id);
            }
        })();
    }, [closeSSE, loadHistory, startSSE, refreshSessionsImpl, clearCompacting]);
    useEffect(() => {
        if (activeSession?.state === 'running' && !sseAbort.current) {
            startSSE(activeSession.bridge_id);
        }
    }, [activeSession?.state, activeSession?.bridge_id, startSSE]);
    // --- Stuck-running reconciler ---
    //
    // A freshly created harness reports state='running' while it boots, then
    // emits a `session_state: idle` event when ready. If that event lands
    // before our SSE attaches (or is otherwise missed), the Composer stays
    // disabled forever — no further state changes can rescue it without a
    // manual refresh. Watchdog: when the active session sits in `running`
    // with no activity, repoll /sessions every 2s for up to ~10s. As soon as
    // the server reports a different state, the deps change and the loop
    // unwinds on its own.
    useEffect(() => {
        if (!activeSessionId)
            return;
        if (activeSession?.state !== 'running')
            return;
        if (activity.kind !== 'idle')
            return;
        let attempts = 0;
        const t = window.setInterval(() => {
            attempts++;
            refreshSessionsImpl();
            if (attempts >= 5)
                window.clearInterval(t);
        }, 2000);
        return () => window.clearInterval(t);
    }, [activeSessionId, activeSession?.state, activity.kind, refreshSessionsImpl]);
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
            const body = {
                ...opts,
                client_id: opts.client_id ?? `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
        // Optimistic user row keyed by clientId. When /send returns with the
        // canonical bridge MessageID we patch the row's key to the grouping key
        // (`${messageId}_user_message`) so the user_message SSE event coalesces
        // into the same row.
        const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const optimistic = {
            key: clientId,
            clientId,
            eventIds: [],
            actor: 'user',
            kind: 'user_message',
            eventType: 'user_message',
            timestamp: new Date().toISOString(),
            text,
            events: [],
            done: true,
        };
        setLogRows(prev => [...prev, optimistic]);
        setError(null);
        unmarkInterrupted(activeSessionId);
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
            const body = await res.json().catch(() => ({}));
            if (body.message_id) {
                const newKey = `${body.message_id}_user_message`;
                setLogRows(prev => prev.map(r => r.clientId === clientId ? { ...r, messageId: body.message_id, key: newKey } : r));
            }
            lastEventId.current = undefined;
            startSSE(activeSessionId);
            refreshSessions();
        }
        catch (err) {
            setError(`Send failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions, unmarkInterrupted]);
    const markLastAssistantDone = useCallback(() => {
        setLogRows(prev => {
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].actor === 'assistant' && !prev[i].done) {
                    const next = prev.slice();
                    next[i] = { ...next[i], done: true };
                    return next;
                }
            }
            return prev;
        });
    }, []);
    const interrupt = useCallback(async () => {
        if (!activeSessionId)
            return;
        try {
            await fetchFn(`${basePath}/sessions/${activeSessionId}/interrupt`, { method: 'POST' });
            markInterrupted(activeSessionId);
            markLastAssistantDone();
            setActivity({ kind: 'idle' });
            refreshSessions();
        }
        catch (err) {
            setError(`Interrupt failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, refreshSessions, markLastAssistantDone, markInterrupted]);
    const resume = useCallback(async () => {
        if (!activeSessionId)
            return;
        try {
            const res = await fetchFn(`${basePath}/sessions/${activeSessionId}/resume`, { method: 'POST' });
            if (!res.ok) {
                setError(`Resume failed: ${res.statusText}`);
                return;
            }
            unmarkInterrupted(activeSessionId);
            startSSE(activeSessionId);
            refreshSessions();
        }
        catch (err) {
            setError(`Resume failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, startSSE, refreshSessions, unmarkInterrupted]);
    const stopSession = useCallback(async () => {
        if (!activeSessionId)
            return;
        try {
            await fetchFn(`${basePath}/sessions/${activeSessionId}/stop`, { method: 'POST' });
            closeSSE();
            markLastAssistantDone();
            unmarkInterrupted(activeSessionId);
            setActivity({ kind: 'idle' });
            refreshSessions();
        }
        catch (err) {
            setError(`Stop failed: ${err}`);
        }
    }, [fetchFn, basePath, activeSessionId, closeSSE, refreshSessions, markLastAssistantDone, unmarkInterrupted]);
    const compact = useCallback(async (summary) => {
        if (!activeSessionId)
            return;
        setCompacting(true);
        if (compactingTimer.current)
            clearTimeout(compactingTimer.current);
        compactingTimer.current = setTimeout(() => {
            compactingTimer.current = null;
            setCompacting(false);
        }, 30000);
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
            clearCompacting();
        }
    }, [fetchFn, basePath, activeSessionId, clearCompacting]);
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
    const renameSession = useCallback(async (bridgeID, displayName) => {
        const res = await fetchFn(`${basePath}/sessions/${bridgeID}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: displayName }),
        });
        if (!res.ok) {
            setError(`Rename failed: ${res.statusText}`);
            return;
        }
        await refreshSessionsImpl();
    }, [fetchFn, basePath, refreshSessionsImpl]);
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
    useEffect(() => () => {
        closeSSE();
        debouncedRefresh.cancel();
        if (compactingTimer.current)
            clearTimeout(compactingTimer.current);
    }, [closeSSE, debouncedRefresh]);
    return useMemo(() => ({
        sessions,
        activeSession,
        logRows,
        uiState,
        getSessionUIState,
        activity,
        connected,
        compacting,
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
    }), [
        sessions,
        activeSession,
        logRows,
        uiState,
        getSessionUIState,
        activity,
        connected,
        compacting,
        error,
        loadingHistory,
        createSession,
        selectSession,
        send,
        interrupt,
        resume,
        stopSession,
        compact,
        forkSession,
        renameSession,
        sendConfig,
        refreshSessions,
    ]);
}
//# sourceMappingURL=useBridgeSession.js.map