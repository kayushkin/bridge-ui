import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeHarnesses } from '../useBridgeHarnesses';
import { useSessionContentSearch, sessionContentSearchReachOf } from '../useSessionContentSearch';
import { formatTokens, timeAgo } from '../utils';
const STATE_COLORS = {
    running: '#22c55e', idle: '#60a5fa', completed: '#888',
    error: '#ef4444', aborted: '#ef4444', waiting_on_approval: '#f59e0b',
};
/** True when some session on screen has no token total yet, which is what
 *  makes the page ask the server for the aggregate. */
export function sessionTokenTotalsAreMissing(sessions, known) {
    return sessions.some(s => s.state !== 'empty' && !known.has(s.session_id));
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
        if (s.state !== 'empty' && !next.has(s.session_id)) {
            next.set(s.session_id, { input: 0, output: 0 });
        }
    }
    return next;
}
export function BridgeSessions() {
    const { fetch: apiFetch, basePath, routes } = useBridgeConfig();
    const [sessions, setSessions] = useState([]);
    const [tokensMap, setTokensMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [filterHarness, setFilterHarness] = useState('');
    const [filterState, setFilterState] = useState('');
    const [filterInstance, setFilterInstance] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const inst = useBridgeInstances();
    const { harnessMap } = useBridgeHarnesses();
    const navigate = useNavigate();
    const fetchSessions = useCallback(async () => {
        try {
            const res = await apiFetch(`${basePath}/sessions`);
            if (res.ok)
                setSessions(await res.json() ?? []);
        }
        catch { /* ignore */ }
        finally {
            setLoading(false);
        }
    }, [apiFetch, basePath]);
    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 15000);
        return () => clearInterval(interval);
    }, [fetchSessions]);
    // Transcript text is the ONLY thing this page's search matches on, so null
    // hits mean it cannot narrow the list at all. It then shows the list
    // unnarrowed and says so — see useSessionContentSearch. Emptying the list on a
    // failure, which is what this used to do, reported a dead log-store as "no
    // session contains your words".
    const searchQuery = searchInput.trim();
    const contentSearch = useSessionContentSearch(searchQuery, apiFetch, basePath);
    const { hits: searchHits, error: searchError } = contentSearch;
    const searchReach = sessionContentSearchReachOf(searchQuery, contentSearch);
    const harnessesAvail = useMemo(() => [...new Set(sessions.map(s => s.harness))].sort(), [sessions]);
    const states = useMemo(() => [...new Set(sessions.map(s => s.state))].sort(), [sessions]);
    const filtered = useMemo(() => {
        let list = [...sessions];
        if (filterHarness)
            list = list.filter(s => s.harness === filterHarness);
        if (filterState)
            list = list.filter(s => s.state === filterState);
        if (filterInstance)
            list = list.filter(s => s.instance_id === filterInstance);
        if (searchHits)
            list = list.filter(s => searchHits.has(s.session_id));
        return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }, [sessions, filterHarness, filterState, filterInstance, searchHits]);
    const tokensMapRef = useRef(tokensMap);
    tokensMapRef.current = tokensMap;
    // Token totals for the rows come from the server-side aggregate, one request
    // covering every session. This column used to fetch each session's FULL
    // message history and add the usage up in the browser, capped at 30 sessions
    // because a single one of those downloads reaches 306MB / 52s on a long
    // session. The aggregate is the same sum over the same result events — see
    // log-store ListSessionAggregates — so the number is unchanged, and the cap
    // is gone with the cost that forced it.
    useEffect(() => {
        const current = tokensMapRef.current;
        if (!sessionTokenTotalsAreMissing(filtered, current))
            return;
        let cancelled = false;
        (async () => {
            try {
                const res = await apiFetch(`${basePath}/sessions/aggregates`);
                if (!res.ok)
                    return;
                const aggregates = await res.json() ?? [];
                if (cancelled)
                    return;
                setTokensMap(applySessionAggregates(current, aggregates, filtered));
            }
            catch { /* leave the column blank */ }
        })();
        return () => { cancelled = true; };
    }, [filtered, apiFetch, basePath]);
    const handleClick = (session) => {
        navigate(routes.chat, { state: { selectSession: session.session_id } });
    };
    const counts = useMemo(() => {
        const c = {};
        for (const s of sessions)
            c[s.state] = (c[s.state] || 0) + 1;
        return c;
    }, [sessions]);
    return (_jsxs("div", { className: "bs-container", children: [_jsxs("div", { className: "bs-header", children: [_jsx("h2", { children: "All Sessions" }), _jsx("div", { className: "bs-counts", children: Object.entries(counts).map(([state, n]) => (_jsxs("span", { className: "bs-count-badge", style: { color: STATE_COLORS[state] || '#888' }, children: [n, " ", state] }, state))) })] }), _jsxs("div", { className: "bs-filters", children: [_jsx("input", { type: "search", placeholder: "Search message content\u2026", value: searchInput, onChange: e => setSearchInput(e.target.value), className: "bs-search" }), _jsxs("select", { value: filterHarness, onChange: e => setFilterHarness(e.target.value), children: [_jsx("option", { value: "", children: "All harnesses" }), harnessesAvail.map(h => _jsx("option", { value: h, children: h }, h))] }), _jsxs("select", { value: filterState, onChange: e => setFilterState(e.target.value), children: [_jsx("option", { value: "", children: "All states" }), states.map(s => _jsx("option", { value: s, children: s }, s))] }), _jsxs("select", { value: filterInstance, onChange: e => setFilterInstance(e.target.value), children: [_jsx("option", { value: "", children: "All instances" }), inst.instances.map(i => _jsx("option", { value: i.id, children: i.name }, i.id))] }), searchReach === 'searching' && _jsx("span", { className: "bs-search-status", children: "Searching\u2026" }), searchReach === 'transcripts-included' && (_jsxs("span", { className: "bs-search-status", children: [filtered.length, " match", filtered.length === 1 ? '' : 'es'] }))] }), searchReach === 'transcripts-unavailable' && (_jsxs("div", { className: "bs-search-degraded", role: "status", children: ["Message-content search failed (", searchError, ") \u2014 the list below is NOT filtered by your search."] })), loading ? (_jsx("div", { className: "bs-loading", children: "Loading..." })) : filtered.length === 0 ? (_jsx("div", { className: "bs-empty", children: "No sessions match filters" })) : (_jsx("ul", { className: "bs-list", children: filtered.map(s => {
                    const instance = s.instance_id ? inst.instanceMap.get(s.instance_id) : undefined;
                    const matchCount = searchHits?.get(s.session_id);
                    const hinfo = harnessMap.get(s.harness);
                    const tokens = tokensMap.get(s.session_id);
                    const totalTokens = tokens ? tokens.input + tokens.output : undefined;
                    return (_jsx("li", { children: _jsxs("button", { className: "bs-row", onClick: () => handleClick(s), children: [_jsx("span", { className: "bs-row-harness", title: hinfo?.label || s.harness, children: hinfo?.image
                                        ? _jsx("img", { src: `${basePath}${hinfo.image}`, alt: hinfo.label || s.harness })
                                        : _jsx("span", { className: "bs-row-emoji", children: hinfo?.emoji || '·' }) }), _jsx("span", { className: "bs-state-dot", style: { background: STATE_COLORS[s.state] || '#888' } }), _jsx("span", { className: "bs-row-name", children: s.display_name || s.session_id.slice(0, 16) }), instance && _jsx("span", { className: "bs-row-instance", children: instance.name }), _jsx("span", { className: "bs-row-tokens", children: totalTokens !== undefined && totalTokens > 0 ? `${formatTokens(totalTokens)} tok` : '' }), matchCount !== undefined && (_jsxs("span", { className: "bs-match-badge", children: [matchCount, " match", matchCount === 1 ? '' : 'es'] })), _jsx("span", { className: "bs-row-time", children: timeAgo(s.updated_at) })] }) }, s.session_id));
                }) }))] }));
}
//# sourceMappingURL=BridgeSessions.js.map