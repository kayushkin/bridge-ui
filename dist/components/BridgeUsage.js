import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
import { formatTokens, formatDuration } from '../utils';
function sourceLabel(source) {
    return source || 'Interactive';
}
// Distinct, color-blind-friendly palette used by both pie charts and the
// per-source/harness chips. Indexed by hash-like position so colors stay
// stable across renders for a given key.
const PIE_COLORS = [
    '#60a5fa', '#f59e0b', '#a78bfa', '#34d399', '#f472b6',
    '#fbbf24', '#22d3ee', '#fb7185', '#4ade80', '#c084fc',
    '#fca5a5', '#93c5fd',
];
function colorFor(index) {
    return PIE_COLORS[index % PIE_COLORS.length];
}
function PieChart({ title, slices, valueFmt }) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total <= 0)
        return null;
    const r = 60;
    const cx = 70;
    const cy = 70;
    let acc = 0;
    const paths = slices.map(s => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += s.value;
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const large = end - start > Math.PI ? 1 : 0;
        // Single-slice (whole pie) — render as a full circle so the path doesn't
        // collapse to a zero-length arc.
        if (slices.length === 1) {
            return { key: s.key, color: s.color, d: `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0` };
        }
        return { key: s.key, color: s.color, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` };
    });
    return (_jsxs("div", { className: "bu-pie", children: [_jsx("div", { className: "bu-pie-title", children: title }), _jsxs("div", { className: "bu-pie-body", children: [_jsx("svg", { width: 140, height: 140, viewBox: "0 0 140 140", children: paths.map(p => (_jsx("path", { d: p.d, fill: p.color, stroke: "var(--bg-surface)", strokeWidth: 1 }, p.key))) }), _jsx("div", { className: "bu-pie-legend", children: slices.map(s => {
                            const pct = (s.value / total) * 100;
                            return (_jsxs("div", { className: "bu-pie-legend-row", children: [_jsx("span", { className: "bu-pie-swatch", style: { background: s.color } }), _jsx("span", { className: "bu-pie-legend-label", children: s.label }), _jsx("span", { className: "bu-pie-legend-value", children: valueFmt(s.value) }), _jsxs("span", { className: "bu-pie-legend-pct", children: [pct.toFixed(0), "%"] })] }, s.key));
                        }) })] })] }));
}
const WINDOW_LABELS = {
    five_hour: '5-Hour',
    seven_day: '7-Day',
    seven_day_oauth_apps: '7-Day OAuth Apps',
    seven_day_opus: '7-Day Opus',
    seven_day_sonnet: '7-Day Sonnet',
    seven_day_cowork: '7-Day Cowork',
    weekly: 'Weekly',
    extra_usage: 'Extra Usage',
};
const PROVIDER_LABELS = {
    anthropic: 'Claude',
    codex: 'Codex',
};
const SPEND_PROVIDER_LABELS = {
    anthropic: 'Anthropic API',
    openai: 'OpenAI / Codex API',
};
function formatTimeUntil(unixSec) {
    const diffMs = unixSec * 1000 - Date.now();
    if (diffMs <= 0)
        return 'now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60)
        return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24)
        return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
}
function LimitBar({ label, win }) {
    const pct = Math.min(win.used_percent, 100);
    const color = pct >= 80 ? '#ef5350' : pct >= 50 ? '#ffa726' : '#66bb6a';
    return (_jsxs("div", { className: "bu-limit-item", children: [_jsxs("div", { className: "bu-limit-header", children: [_jsx("span", { className: "bu-limit-label", children: label }), _jsxs("span", { className: "bu-limit-pct", style: { color }, children: [pct.toFixed(0), "%"] })] }), _jsx("div", { className: "bu-limit-track", children: _jsx("div", { className: "bu-limit-fill", style: { width: `${pct}%`, background: color } }) }), win.resets_at != null && (_jsxs("span", { className: "bu-limit-reset", children: ["resets in ", formatTimeUntil(win.resets_at)] }))] }));
}
function periodCutoff(period) {
    const ms = period === 'day' ? 86400000 : period === 'week' ? 604800000 : 2592000000;
    return new Date(Date.now() - ms).toISOString();
}
export function BridgeUsage() {
    const { fetch: apiFetch, basePath, usageStoreBasePath } = useBridgeConfig();
    const [sessions, setSessions] = useState([]);
    const [aggregates, setAggregates] = useState(new Map());
    const [limits, setLimits] = useState(null);
    const [spend, setSpend] = useState(null);
    const [expandedRaw, setExpandedRaw] = useState({});
    const [expandedKeys, setExpandedKeys] = useState({});
    const [addCreditOpen, setAddCreditOpen] = useState(null);
    const [addCreditDraft, setAddCreditDraft] = useState({ amount: '', date: '', note: '' });
    const [loading, setLoading] = useState(true);
    const [loadingUsage, setLoadingUsage] = useState(false);
    const [period, setPeriod] = useState('day');
    const inst = useBridgeInstances();
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
    // Pull all per-session token/cost totals in one shot from log-store
    // (proxied via bridge-server). Replaces the prior per-session messages
    // fan-out that summed input/output/cost/duration in the browser.
    const fetchAggregates = useCallback(async () => {
        setLoadingUsage(true);
        try {
            const res = await apiFetch(`${basePath}/sessions/aggregates`);
            if (!res.ok)
                return;
            const rows = await res.json() ?? [];
            const map = new Map();
            for (const r of rows)
                map.set(r.session_id, r);
            setAggregates(map);
        }
        catch { /* ignore */ }
        finally {
            setLoadingUsage(false);
        }
    }, [apiFetch, basePath]);
    // Subscription limits live on usage-store. Skipped entirely when no
    // usageStoreBasePath is configured.
    const fetchLimits = useCallback(async () => {
        if (!usageStoreBasePath)
            return;
        try {
            const res = await apiFetch(`${usageStoreBasePath}/limits`);
            if (res.ok)
                setLimits(await res.json());
        }
        catch { /* ignore */ }
    }, [apiFetch, usageStoreBasePath]);
    // Per-API-key spend (computed from usage_report token counts × per-model
    // pricing). Refreshed hourly on the server; the UI just reads the latest.
    const fetchSpend = useCallback(async () => {
        if (!usageStoreBasePath)
            return;
        try {
            const res = await apiFetch(`${usageStoreBasePath}/spend/keys`);
            if (res.ok)
                setSpend(await res.json());
        }
        catch { /* ignore */ }
    }, [apiFetch, usageStoreBasePath]);
    const submitTopup = useCallback(async (provider) => {
        if (!usageStoreBasePath)
            return;
        const amount = parseFloat(addCreditDraft.amount);
        if (!isFinite(amount) || amount <= 0)
            return;
        const body = { provider, amount_usd: amount, note: addCreditDraft.note };
        if (addCreditDraft.date)
            body.occurred_at_str = addCreditDraft.date;
        try {
            const res = await apiFetch(`${usageStoreBasePath}/spend/topups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setAddCreditOpen(null);
                setAddCreditDraft({ amount: '', date: '', note: '' });
                fetchSpend();
            }
        }
        catch { /* ignore */ }
    }, [apiFetch, addCreditDraft, fetchSpend, usageStoreBasePath]);
    const deleteTopup = useCallback(async (id) => {
        if (!usageStoreBasePath)
            return;
        if (!confirm('Delete this top-up?'))
            return;
        try {
            const res = await apiFetch(`${usageStoreBasePath}/spend/topups/${id}`, { method: 'DELETE' });
            if (res.ok)
                fetchSpend();
        }
        catch { /* ignore */ }
    }, [apiFetch, fetchSpend, usageStoreBasePath]);
    const toggleRaw = useCallback(async (provider, apiKeyID) => {
        if (!usageStoreBasePath)
            return;
        const k = `${provider}:${apiKeyID}`;
        setExpandedRaw(prev => {
            if (prev[k] !== undefined) {
                const next = { ...prev };
                delete next[k];
                return next;
            }
            return { ...prev, [k]: 'loading' };
        });
        if (expandedRaw[k] !== undefined)
            return;
        try {
            const res = await apiFetch(`${usageStoreBasePath}/spend/keys/${provider}/${apiKeyID}/raw`);
            const text = res.ok ? await res.text() : `error ${res.status}: ${await res.text()}`;
            setExpandedRaw(prev => ({ ...prev, [k]: text }));
        }
        catch (e) {
            setExpandedRaw(prev => ({ ...prev, [k]: `error: ${e}` }));
        }
    }, [apiFetch, expandedRaw, usageStoreBasePath]);
    useEffect(() => { fetchSessions(); }, [fetchSessions]);
    useEffect(() => { fetchAggregates(); }, [fetchAggregates]);
    useEffect(() => {
        if (!usageStoreBasePath)
            return;
        fetchLimits();
        const t = setInterval(fetchLimits, 60000);
        return () => clearInterval(t);
    }, [fetchLimits, usageStoreBasePath]);
    useEffect(() => {
        if (!usageStoreBasePath)
            return;
        fetchSpend();
        const t = setInterval(fetchSpend, 5 * 60_000);
        return () => clearInterval(t);
    }, [fetchSpend, usageStoreBasePath]);
    const periodSessions = useMemo(() => {
        const cutoff = periodCutoff(period);
        return sessions.filter(s => s.created_at >= cutoff);
    }, [sessions, period]);
    const emptyTotals = () => ({ input: 0, output: 0, cost: 0, duration: 0, turns: 0 });
    const addTotals = (t, u) => {
        t.input += u.inputTokens;
        t.output += u.outputTokens;
        t.cost += u.cost;
        t.duration += u.durationMs;
        t.turns += u.turns;
    };
    const harnessGroups = useMemo(() => {
        const groups = new Map();
        for (const s of periodSessions) {
            const agg = aggregates.get(s.session_id);
            if (!agg)
                continue;
            const usage = {
                sessionId: s.session_id,
                harness: s.harness,
                instanceId: s.instance_id ?? '',
                inputTokens: agg.input_tokens,
                outputTokens: agg.output_tokens,
                cost: agg.cost_usd,
                durationMs: agg.duration_ms,
                model: agg.model ?? '',
                turns: agg.turns,
            };
            let h = groups.get(s.harness);
            if (!h) {
                h = { harness: s.harness, sources: new Map(), totals: emptyTotals(), sessionCount: 0 };
                groups.set(s.harness, h);
            }
            const srcKey = s.purpose ?? '';
            let src = h.sources.get(srcKey);
            if (!src) {
                src = { source: srcKey, sessions: [], totals: emptyTotals() };
                h.sources.set(srcKey, src);
            }
            src.sessions.push(usage);
            addTotals(src.totals, usage);
            addTotals(h.totals, usage);
            h.sessionCount++;
        }
        return groups;
    }, [periodSessions, aggregates]);
    const totals = useMemo(() => {
        let input = 0, output = 0, cost = 0, duration = 0, count = 0;
        for (const [, g] of harnessGroups) {
            input += g.totals.input;
            output += g.totals.output;
            cost += g.totals.cost;
            duration += g.totals.duration;
            count += g.sessionCount;
        }
        return { input, output, cost, duration, count };
    }, [harnessGroups]);
    const harnessSlices = useMemo(() => {
        const arr = Array.from(harnessGroups.values())
            .map((h, i) => ({
            key: h.harness,
            label: h.harness,
            value: h.totals.input + h.totals.output,
            color: colorFor(i),
        }))
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value);
        return arr;
    }, [harnessGroups]);
    const sourceSlices = useMemo(() => {
        const sums = new Map();
        for (const [, h] of harnessGroups) {
            for (const [, src] of h.sources) {
                const key = src.source;
                sums.set(key, (sums.get(key) ?? 0) + src.totals.input + src.totals.output);
            }
        }
        return Array.from(sums.entries())
            .map(([key, value], i) => ({
            key: key || '__interactive',
            label: sourceLabel(key),
            value,
            color: colorFor(i),
        }))
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [harnessGroups]);
    const [expandedSources, setExpandedSources] = useState({});
    const toggleSource = useCallback((harness, source) => {
        const k = `${harness}::${source}`;
        setExpandedSources(prev => ({ ...prev, [k]: !prev[k] }));
    }, []);
    return (_jsxs("div", { className: "bu-container", children: [_jsxs("div", { className: "bu-header", children: [_jsx("h2", { children: "Bridge Usage" }), _jsx("div", { className: "bu-period-tabs", children: ['day', 'week', 'month'].map(p => (_jsx("button", { className: `bu-tab ${period === p ? 'bu-tab-active' : ''}`, onClick: () => setPeriod(p), children: p === 'day' ? '24h' : p === 'week' ? '7d' : '30d' }, p))) })] }), spend && (_jsx("div", { className: "bu-spend-section", children: ['anthropic', 'openai'].map(provider => {
                    const p = spend[provider];
                    const keysOpen = expandedKeys[provider] ?? false;
                    const addOpen = addCreditOpen === provider;
                    return (_jsxs("div", { className: "bu-spend-account", children: [_jsxs("div", { className: "bu-spend-account-row", children: [_jsxs("div", { className: "bu-spend-account-id", children: [_jsx("div", { className: "bu-spend-account-name", children: SPEND_PROVIDER_LABELS[provider] }), _jsx("div", { className: "bu-spend-account-hint", children: p.configured ? (_jsx("code", { children: p.admin_key_hint || 'pending first refresh…' })) : (_jsx("span", { className: "bu-spend-unconfigured", children: "admin key not configured" })) })] }), _jsxs("div", { className: "bu-spend-account-totals", children: [_jsxs("div", { className: "bu-spend-cell", children: [_jsx("span", { className: "bu-spend-window", children: "24h" }), _jsxs("span", { className: "bu-spend-amount", children: ["$", p.total_usd_24h.toFixed(2)] })] }), _jsxs("div", { className: "bu-spend-cell", children: [_jsx("span", { className: "bu-spend-window", children: "7d" }), _jsxs("span", { className: "bu-spend-amount", children: ["$", p.total_usd_7d.toFixed(2)] })] }), _jsxs("div", { className: "bu-spend-cell", children: [_jsx("span", { className: "bu-spend-window", children: "30d" }), _jsxs("span", { className: "bu-spend-amount", children: ["$", p.total_usd_30d.toFixed(2)] })] }), _jsxs("div", { className: "bu-spend-cell bu-spend-balance", children: [_jsx("span", { className: "bu-spend-window", children: "Balance" }), _jsx("span", { className: "bu-spend-amount", children: p.remaining_usd != null ? `$${p.remaining_usd.toFixed(2)}` : '—' }), p.remaining_usd != null && p.balance_since && (_jsxs("span", { className: "bu-spend-fetched", children: ["$", p.topups_total_usd.toFixed(2), " added \u00B7 $", p.spend_since_baseline.toFixed(2), " spent"] }))] })] }), p.configured && (_jsx("button", { className: "bu-spend-add-btn", onClick: () => setAddCreditOpen(addOpen ? null : provider), children: addOpen ? '×' : '+ Add credit' }))] }), addOpen && (_jsxs("div", { className: "bu-spend-addform", children: [_jsx("input", { type: "number", step: "0.01", placeholder: "Amount (USD)", autoFocus: true, value: addCreditDraft.amount, onChange: e => setAddCreditDraft(d => ({ ...d, amount: e.target.value })) }), _jsx("input", { type: "date", placeholder: "Date (UTC)", value: addCreditDraft.date, onChange: e => setAddCreditDraft(d => ({ ...d, date: e.target.value })) }), _jsx("input", { type: "text", placeholder: "Note (optional)", value: addCreditDraft.note, onChange: e => setAddCreditDraft(d => ({ ...d, note: e.target.value })) }), _jsx("button", { onClick: () => submitTopup(provider), children: "Save" })] })), p.topups.length > 0 && (_jsx("div", { className: "bu-spend-topups", children: p.topups.map(t => (_jsxs("div", { className: "bu-spend-topup", children: [_jsxs("span", { className: "bu-spend-topup-amount", children: ["+$", t.amount_usd.toFixed(2)] }), _jsx("span", { className: "bu-spend-topup-date", children: new Date(t.occurred_at * 1000).toLocaleDateString() }), t.note && _jsx("span", { className: "bu-spend-topup-note", children: t.note }), _jsx("button", { className: "bu-spend-topup-del", onClick: () => deleteTopup(t.id), title: "Delete", children: "\u00D7" })] }, t.id))) })), p.keys.length > 0 && (_jsxs("div", { className: "bu-spend-keys", children: [_jsxs("button", { className: "bu-spend-keys-toggle", onClick: () => setExpandedKeys(prev => ({ ...prev, [provider]: !keysOpen })), children: [keysOpen ? '▼' : '▶', " ", p.keys.length, " API key", p.keys.length === 1 ? '' : 's'] }), keysOpen && (_jsxs("table", { className: "bu-spend-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Key" }), _jsx("th", { className: "bu-spend-num", children: "24h" }), _jsx("th", { className: "bu-spend-num", children: "7d" }), _jsx("th", { className: "bu-spend-num", children: "30d" }), _jsx("th", {})] }) }), _jsx("tbody", { children: p.keys.map(k => {
                                                    const rawKey = `${provider}:${k.api_key_id}`;
                                                    const raw = expandedRaw[rawKey];
                                                    const isOpen = raw !== undefined;
                                                    return (_jsxs(Fragment, { children: [_jsxs("tr", { className: k.api_key_status !== 'active' ? 'bu-spend-row-inactive' : '', children: [_jsxs("td", { children: [_jsx("div", { className: "bu-spend-keyname", children: k.api_key_name || k.api_key_id }), _jsxs("div", { className: "bu-spend-keyhint", children: [_jsx("code", { children: k.api_key_hint }), k.api_key_status !== 'active' && _jsxs("span", { className: "bu-spend-keystatus", children: [" \u00B7 ", k.api_key_status] })] })] }), _jsxs("td", { className: "bu-spend-num", children: ["$", k.total_usd_24h.toFixed(2)] }), _jsxs("td", { className: "bu-spend-num", children: ["$", k.total_usd_7d.toFixed(2)] }), _jsxs("td", { className: "bu-spend-num", children: ["$", k.total_usd_30d.toFixed(2)] }), _jsx("td", { children: _jsx("button", { className: "bu-spend-toggle", onClick: () => toggleRaw(provider, k.api_key_id), children: isOpen ? 'hide raw' : 'raw' }) })] }), isOpen && (_jsx("tr", { className: "bu-spend-raw-row", children: _jsx("td", { colSpan: 5, children: _jsx("pre", { className: "bu-spend-raw", children: raw === 'loading' ? 'loading...' : raw }) }) }))] }, rawKey));
                                                }) })] }))] }))] }, provider));
                }) })), limits && (_jsx("div", { className: "bu-limits-section", children: Object.entries(limits).map(([provider, p]) => {
                    if (!p)
                        return null;
                    const stale = p.stale_after != null && Date.now() / 1000 > p.stale_after;
                    const windowEntries = Object.entries(p.windows).filter(([, w]) => w.used_percent > 0 || w.resets_at != null);
                    if (windowEntries.length === 0)
                        return null;
                    return (_jsxs("div", { className: "bu-limits-provider", children: [_jsxs("div", { className: "bu-limits-header", children: [_jsx("span", { className: "bu-limits-title", children: PROVIDER_LABELS[provider] ?? provider }), p.plan_type && _jsxs("span", { className: "bu-limits-tier", children: [p.plan_type, p.tier?.includes('20x') ? ' 20x' : p.tier?.includes('5x') ? ' 5x' : ''] }), stale && _jsx("span", { className: "bu-limits-stale", title: `snapshot from ${new Date(p.snapshot_at * 1000).toLocaleString()}`, children: "stale" })] }), _jsx("div", { className: "bu-limits-grid", children: windowEntries.map(([key, win]) => (_jsx(LimitBar, { label: WINDOW_LABELS[key] ?? key, win: win }, key))) })] }, provider));
                }) })), loading ? (_jsx("div", { className: "bu-loading", children: "Loading..." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bu-totals-row", children: [_jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Sessions" }), _jsx("span", { className: "bu-total-value", children: totals.count })] }), _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Input" }), _jsx("span", { className: "bu-total-value", children: formatTokens(totals.input) })] }), _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Output" }), _jsx("span", { className: "bu-total-value", children: formatTokens(totals.output) })] }), totals.cost > 0 && _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Cost" }), _jsxs("span", { className: "bu-total-value", children: ["$", totals.cost.toFixed(2)] })] }), _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Time" }), _jsx("span", { className: "bu-total-value", children: formatDuration(totals.duration) })] })] }), (harnessSlices.length > 0 || sourceSlices.length > 0) && (_jsxs("div", { className: "bu-pies-row", children: [_jsx(PieChart, { title: "By harness", slices: harnessSlices, valueFmt: formatTokens }), _jsx(PieChart, { title: "By source", slices: sourceSlices, valueFmt: formatTokens })] })), loadingUsage && _jsx("div", { className: "bu-loading-small", children: "Loading session details..." }), Array.from(harnessGroups.entries()).map(([harness, group]) => {
                        const sources = Array.from(group.sources.values())
                            .sort((a, b) => (b.totals.input + b.totals.output) - (a.totals.input + a.totals.output));
                        const totalTok = group.totals.input + group.totals.output || 1;
                        return (_jsxs("div", { className: "bu-harness-section", children: [_jsxs("div", { className: "bu-harness-header", children: [_jsx("span", { className: "bu-harness-name", children: harness }), _jsxs("span", { className: "bu-harness-summary", children: [group.sessionCount, " sessions \u00B7 ", formatTokens(group.totals.input + group.totals.output), " tokens", group.totals.cost > 0 && ` \u00B7 $${group.totals.cost.toFixed(2)}`] })] }), _jsxs("div", { className: "bu-token-bar", children: [_jsx("div", { className: "bu-token-bar-in", style: { width: `${(group.totals.input / totalTok) * 100}%` } }), _jsx("div", { className: "bu-token-bar-out", style: { width: `${(group.totals.output / totalTok) * 100}%` } })] }), _jsx("div", { className: "bu-source-list", children: sources.map(src => {
                                        const k = `${harness}::${src.source}`;
                                        const open = !!expandedSources[k];
                                        const label = sourceLabel(src.source);
                                        return (_jsxs("div", { className: "bu-source-group", children: [_jsxs("button", { type: "button", className: "bu-source-row", onClick: () => toggleSource(harness, src.source), "aria-expanded": open, children: [_jsx("span", { className: "bu-source-toggle", children: open ? '\u25BC' : '\u25B6' }), _jsx("span", { className: "bu-source-label", children: label }), _jsxs("span", { className: "bu-source-count", children: [src.sessions.length, " session", src.sessions.length === 1 ? '' : 's'] }), _jsxs("span", { className: "bu-source-tokens", children: [formatTokens(src.totals.input), " in \u00B7 ", formatTokens(src.totals.output), " out"] }), src.totals.cost > 0 && _jsxs("span", { className: "bu-source-cost", children: ["$", src.totals.cost.toFixed(2)] }), src.totals.duration > 0 && _jsx("span", { className: "bu-source-duration", children: formatDuration(src.totals.duration) })] }), open && (_jsx("div", { className: "bu-session-list", children: src.sessions.slice().sort((a, b) => b.cost - a.cost).map(u => {
                                                        const instance = inst.instanceMap.get(u.instanceId);
                                                        return (_jsxs("div", { className: "bu-session-row", children: [_jsx("span", { className: "bu-session-id", children: u.sessionId.slice(0, 16) }), instance && _jsx("span", { className: "bu-instance-label", children: instance.name }), _jsx("span", { className: "bu-session-model", children: u.model?.replace(/^claude-/, '').replace(/\[.*$/, '') }), _jsxs("span", { children: [u.turns, " turns"] }), _jsxs("span", { children: [formatTokens(u.inputTokens), " in"] }), _jsxs("span", { children: [formatTokens(u.outputTokens), " out"] }), u.cost > 0 && _jsxs("span", { children: ["$", u.cost.toFixed(3)] }), u.durationMs > 0 && _jsx("span", { children: formatDuration(u.durationMs) })] }, u.sessionId));
                                                    }) }))] }, k));
                                    }) })] }, harness));
                    }), harnessGroups.size === 0 && !loadingUsage && (_jsx("div", { className: "bu-empty", children: "No usage data for this period" }))] }))] }));
}
//# sourceMappingURL=BridgeUsage.js.map