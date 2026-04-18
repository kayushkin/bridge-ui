import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
import { formatTokens, timeAgo } from '../utils';
const STATE_COLORS = {
    running: '#22c55e', idle: '#60a5fa', completed: '#888',
    error: '#ef4444', aborted: '#ef4444', waiting_on_approval: '#f59e0b',
};
export function BridgeSessions() {
    const { fetch: apiFetch, basePath, routes } = useBridgeConfig();
    const [sessions, setSessions] = useState([]);
    const [harnesses, setHarnesses] = useState([]);
    const [tokensMap, setTokensMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [filterHarness, setFilterHarness] = useState('');
    const [filterState, setFilterState] = useState('');
    const [filterInstance, setFilterInstance] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchHits, setSearchHits] = useState(null);
    const [searching, setSearching] = useState(false);
    const inst = useBridgeInstances();
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
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
    }, [apiFetch, basePath]);
    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);
    useEffect(() => {
        if (!searchQuery) {
            setSearchHits(null);
            setSearching(false);
            return;
        }
        let cancelled = false;
        setSearching(true);
        apiFetch(`${basePath}/sessions/search?q=${encodeURIComponent(searchQuery)}`)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(`search failed: ${r.status}`);
            const hits = await r.json() ?? [];
            if (cancelled)
                return;
            setSearchHits(new Map(hits.map(h => [h.session_id, h.match_count])));
        })
            .catch(() => { if (!cancelled)
            setSearchHits(new Map()); })
            .finally(() => { if (!cancelled)
            setSearching(false); });
        return () => { cancelled = true; };
    }, [searchQuery, apiFetch, basePath]);
    const harnessMap = useMemo(() => new Map(harnesses.map(h => [h.name, h])), [harnesses]);
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
            list = list.filter(s => searchHits.has(s.bridge_id));
        return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }, [sessions, filterHarness, filterState, filterInstance, searchHits]);
    const tokensMapRef = useRef(tokensMap);
    tokensMapRef.current = tokensMap;
    useEffect(() => {
        const current = tokensMapRef.current;
        const toLoad = filtered.filter(s => s.state !== 'empty' && !current.has(s.bridge_id)).slice(0, 30);
        if (toLoad.length === 0)
            return;
        let cancelled = false;
        (async () => {
            const next = new Map(current);
            for (const s of toLoad) {
                try {
                    const res = await apiFetch(`${basePath}/sessions/${s.bridge_id}/messages`);
                    if (!res.ok)
                        continue;
                    const msgs = await res.json() ?? [];
                    let input = 0, output = 0;
                    for (const m of msgs) {
                        if (m.role === 'assistant' && m.meta?.usage) {
                            input += m.meta.usage.input_tokens || 0;
                            output += m.meta.usage.output_tokens || 0;
                        }
                    }
                    next.set(s.bridge_id, { input, output });
                }
                catch { /* skip */ }
            }
            if (!cancelled)
                setTokensMap(next);
        })();
        return () => { cancelled = true; };
    }, [filtered, apiFetch, basePath]);
    const handleClick = (session) => {
        navigate(routes.chat, { state: { selectSession: session.bridge_id } });
    };
    const counts = useMemo(() => {
        const c = {};
        for (const s of sessions)
            c[s.state] = (c[s.state] || 0) + 1;
        return c;
    }, [sessions]);
    return (_jsxs("div", { className: "bs-container", children: [_jsxs("div", { className: "bs-header", children: [_jsx("h2", { children: "All Sessions" }), _jsx("div", { className: "bs-counts", children: Object.entries(counts).map(([state, n]) => (_jsxs("span", { className: "bs-count-badge", style: { color: STATE_COLORS[state] || '#888' }, children: [n, " ", state] }, state))) })] }), _jsxs("div", { className: "bs-filters", children: [_jsx("input", { type: "search", placeholder: "Search message content\u2026", value: searchInput, onChange: e => setSearchInput(e.target.value), className: "bs-search" }), _jsxs("select", { value: filterHarness, onChange: e => setFilterHarness(e.target.value), children: [_jsx("option", { value: "", children: "All harnesses" }), harnessesAvail.map(h => _jsx("option", { value: h, children: h }, h))] }), _jsxs("select", { value: filterState, onChange: e => setFilterState(e.target.value), children: [_jsx("option", { value: "", children: "All states" }), states.map(s => _jsx("option", { value: s, children: s }, s))] }), _jsxs("select", { value: filterInstance, onChange: e => setFilterInstance(e.target.value), children: [_jsx("option", { value: "", children: "All instances" }), inst.instances.map(i => _jsx("option", { value: i.id, children: i.name }, i.id))] }), searching && _jsx("span", { className: "bs-search-status", children: "Searching\u2026" }), !searching && searchHits && (_jsxs("span", { className: "bs-search-status", children: [filtered.length, " match", filtered.length === 1 ? '' : 'es'] }))] }), loading ? (_jsx("div", { className: "bs-loading", children: "Loading..." })) : filtered.length === 0 ? (_jsx("div", { className: "bs-empty", children: "No sessions match filters" })) : (_jsx("ul", { className: "bs-list", children: filtered.map(s => {
                    const instance = s.instance_id ? inst.instanceMap.get(s.instance_id) : undefined;
                    const matchCount = searchHits?.get(s.bridge_id);
                    const hinfo = harnessMap.get(s.harness);
                    const tokens = tokensMap.get(s.bridge_id);
                    const totalTokens = tokens ? tokens.input + tokens.output : undefined;
                    return (_jsx("li", { children: _jsxs("button", { className: "bs-row", onClick: () => handleClick(s), children: [_jsx("span", { className: "bs-row-harness", title: hinfo?.label || s.harness, children: hinfo?.image
                                        ? _jsx("img", { src: `${basePath}${hinfo.image}`, alt: hinfo.label || s.harness })
                                        : _jsx("span", { className: "bs-row-emoji", children: hinfo?.emoji || '·' }) }), _jsx("span", { className: "bs-state-dot", style: { background: STATE_COLORS[s.state] || '#888' } }), _jsx("span", { className: "bs-row-name", children: s.display_name || s.bridge_id.slice(0, 16) }), instance && _jsx("span", { className: "bs-row-instance", children: instance.name }), _jsx("span", { className: "bs-row-tokens", children: totalTokens !== undefined && totalTokens > 0 ? `${formatTokens(totalTokens)} tok` : '' }), matchCount !== undefined && (_jsxs("span", { className: "bs-match-badge", children: [matchCount, " match", matchCount === 1 ? '' : 'es'] })), _jsx("span", { className: "bs-row-time", children: timeAgo(s.updated_at) })] }) }, s.bridge_id));
                }) }))] }));
}
//# sourceMappingURL=BridgeSessions.js.map