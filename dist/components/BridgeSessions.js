import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilters, useSessionList } from '@kayushkin/chat-core';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeHarnesses } from '../useBridgeHarnesses';
import { formatTokens, timeAgo } from '../utils';
const STATE_COLORS = {
    running: '#22c55e', idle: '#60a5fa', completed: '#888',
    error: '#ef4444', aborted: '#ef4444', waiting_on_approval: '#f59e0b',
};
/** True when some session on screen has no token total yet, which is what
 *  makes the page ask the server for the aggregate. */
export function sessionTokenTotalsAreMissing(sessions, known) {
    return sessions.some(s => s.state !== 'empty' && !known.has(s.sessionId));
}
/**
 * Folds one GET /sessions/aggregates response into the token map.
 *
 * Sessions the aggregate omits (log-store leaves out any session with no
 * usage at all) are recorded as zero rather than left absent. Without that,
 * `sessionTokenTotalsAreMissing` would stay true for them forever and the
 * page would re-fetch the whole aggregate on every render.
 */
export function applySessionAggregates(known, aggregates, onScreen) {
    const next = new Map(known);
    for (const a of aggregates) {
        next.set(a.session_id, { input: a.input_tokens || 0, output: a.output_tokens || 0 });
    }
    for (const s of onScreen) {
        if (s.state !== 'empty' && !next.has(s.sessionId)) {
            next.set(s.sessionId, { input: 0, output: 0 });
        }
    }
    return next;
}
/** Every session as a flat table, over the SAME store and the SAME filter the
 *  chat sidebar reads. This page used to hold a second copy of the list — its
 *  own `GET /sessions` seed and `/session-events` stream, its own transcript
 *  search — that predated chat-core and was never moved when the chat was.
 *  Filtering here now filters the sidebar and vice versa, which is the honest
 *  consequence of one list: the two were never different sessions.
 *
 *  The page's dropdowns are single-select over chat-core's multi-select axes,
 *  so each writes a one-element list and shows the first element back.
 *  `machine` is the instance axis (it matches `SessionSummary.instanceId`). */
export function BridgeSessions() {
    const { fetch: apiFetch, basePath, routes } = useBridgeConfig();
    const { groups, loading, effectiveState, facets, moreSessions, loadingOlderSessions, loadOlderSessions } = useSessionList();
    const { filter, set, contentSearchReach, searching, searchError } = useFilters();
    const [tokensMap, setTokensMap] = useState(new Map());
    const inst = useBridgeInstances();
    const { harnessMap } = useBridgeHarnesses();
    const navigate = useNavigate();
    // The groups are the sidebar's folders; this table has no folders, so it
    // flattens them and orders by recency. Every filter axis, including the
    // transcript search, is already applied by the store's selector.
    const sessions = useMemo(() => groups.flatMap(g => g.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [groups]);
    const harnessesAvail = useMemo(() => Object.keys(facets.harness).sort(), [facets]);
    const states = useMemo(() => Object.keys(facets.status).sort(), [facets]);
    const searchQuery = filter.search.trim();
    const tokensMapRef = useRef(tokensMap);
    tokensMapRef.current = tokensMap;
    // Token totals for the rows come from the server-side aggregate, one request
    // covering every session. This column used to fetch each session's FULL
    // message history and add the usage up in the browser, capped at 30 sessions
    // because a single one of those downloads reaches 306MB / 52s on a long
    // session. The aggregate is the same sum over the same result events — see
    // log-store ListSessionAggregates — so the number is unchanged, and the cap
    // is gone with the cost that forced it.
    //
    // One aggregate request at a time. The effect re-runs whenever `sessions`
    // changes identity, which the live store makes happen on every upsert — and
    // the response is 2.8MB that takes seconds to arrive on this host, so without
    // this guard each frame that lands mid-flight starts another full download
    // of the same bytes. Measured on the live box: 23 requests and 65.7MB in 24
    // seconds.
    //
    // The guard is a skip, not a queue. A request already in flight will apply
    // its answer to whatever the list holds when it lands, so a skipped run has
    // nothing to add; if rows are still missing after that, the next change to
    // `sessions` runs it again. Refs are read inside the async body for the same
    // reason — the values that matter are the ones at completion, not at call.
    const aggregatesInFlight = useRef(false);
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;
    useEffect(() => {
        if (aggregatesInFlight.current)
            return;
        if (!sessionTokenTotalsAreMissing(sessions, tokensMapRef.current))
            return;
        let cancelled = false;
        aggregatesInFlight.current = true;
        (async () => {
            try {
                const res = await apiFetch(`${basePath}/sessions/aggregates`);
                if (!res.ok)
                    return;
                const aggregates = await res.json() ?? [];
                if (cancelled)
                    return;
                setTokensMap(applySessionAggregates(tokensMapRef.current, aggregates, sessionsRef.current));
            }
            catch { /* leave the column blank */ }
            finally {
                aggregatesInFlight.current = false;
            }
        })();
        return () => { cancelled = true; };
    }, [sessions, apiFetch, basePath]);
    const handleClick = (session) => {
        navigate(routes.chat, { state: { selectSession: session.sessionId } });
    };
    return (_jsxs("div", { className: "bs-container", children: [_jsxs("div", { className: "bs-header", children: [_jsx("h2", { children: "All Sessions" }), _jsx("div", { className: "bs-counts", children: Object.entries(facets.status).map(([state, n]) => (_jsxs("span", { className: "bs-count-badge", style: { color: STATE_COLORS[state] || '#888' }, children: [n, " ", state] }, state))) })] }), _jsxs("div", { className: "bs-filters", children: [_jsx("input", { type: "search", placeholder: "Search message content\u2026", value: filter.search, onChange: e => set({ search: e.target.value }), className: "bs-search" }), _jsxs("select", { value: filter.harness[0] ?? '', onChange: e => set({ harness: e.target.value ? [e.target.value] : [] }), children: [_jsx("option", { value: "", children: "All harnesses" }), harnessesAvail.map(h => _jsx("option", { value: h, children: h }, h))] }), _jsxs("select", { value: filter.status[0] ?? '', onChange: e => set({ status: e.target.value ? [e.target.value] : [] }), children: [_jsx("option", { value: "", children: "All states" }), states.map(s => _jsx("option", { value: s, children: s }, s))] }), _jsxs("select", { value: filter.machine[0] ?? '', onChange: e => set({ machine: e.target.value ? [e.target.value] : [] }), children: [_jsx("option", { value: "", children: "All instances" }), inst.instances.map(i => _jsx("option", { value: i.id, children: i.name }, i.id))] }), searching && _jsx("span", { className: "bs-search-status", children: "Searching\u2026" }), searchQuery && !searching && !searchError && (_jsxs("span", { className: "bs-search-status", children: [sessions.length, " match", sessions.length === 1 ? '' : 'es'] }))] }), searchQuery && searchError && (_jsxs("div", { className: "bs-search-degraded", role: "status", children: ["Message-content search failed (", searchError, ") \u2014 the list below is NOT filtered by your search."] })), contentSearchReach && contentSearchReach.hiddenHitCount > 0 && (_jsxs("div", { className: "bs-search-degraded", role: "status", children: [contentSearchReach.shownHitCount, " of ", contentSearchReach.truncated ? 'at least ' : '', contentSearchReach.hitCount, " transcript ", contentSearchReach.hitCount === 1 ? 'match' : 'matches', " shown \u2014 the rest are filtered out or not loaded."] })), loading ? (_jsx("div", { className: "bs-loading", children: "Loading..." })) : sessions.length === 0 ? (_jsx("div", { className: "bs-empty", children: "No sessions match filters" })) : (_jsx("ul", { className: "bs-list", children: sessions.map(s => {
                    const instance = s.instanceId ? inst.instanceMap.get(s.instanceId) : undefined;
                    const hinfo = harnessMap.get(s.harness);
                    const tokens = tokensMap.get(s.sessionId);
                    const totalTokens = tokens ? tokens.input + tokens.output : undefined;
                    const state = effectiveState(s.sessionId);
                    return (_jsx("li", { children: _jsxs("button", { className: "bs-row", onClick: () => handleClick(s), children: [_jsx("span", { className: "bs-row-harness", title: hinfo?.label || s.harness, children: hinfo?.image
                                        ? _jsx("img", { src: `${basePath}${hinfo.image}`, alt: hinfo.label || s.harness })
                                        : _jsx("span", { className: "bs-row-emoji", children: hinfo?.emoji || '·' }) }), _jsx("span", { className: "bs-state-dot", style: { background: STATE_COLORS[state] || '#888' } }), _jsx("span", { className: "bs-row-name", children: s.displayName || s.sessionId.slice(0, 16) }), instance && _jsx("span", { className: "bs-row-instance", children: instance.name }), _jsx("span", { className: "bs-row-tokens", children: totalTokens !== undefined && totalTokens > 0 ? `${formatTokens(totalTokens)} tok` : '' }), _jsx("span", { className: "bs-row-time", children: timeAgo(s.updatedAt) })] }) }, s.sessionId));
                }) })), moreSessions && (_jsx("button", { type: "button", className: "bs-load-older", onClick: loadOlderSessions, disabled: loadingOlderSessions, children: loadingOlderSessions ? 'Loading older sessions…' : 'Load older sessions' }))] }));
}
//# sourceMappingURL=BridgeSessions.js.map