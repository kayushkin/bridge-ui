import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeInstances } from '../useBridgeInstances';
import { formatTokens, formatDuration } from '../utils';
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
const SPEND_WINDOW_LABELS = {
    day: '24h',
    week: '7d',
    month: '30d',
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
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const [sessions, setSessions] = useState([]);
    const [usageMap, setUsageMap] = useState(new Map());
    const [limits, setLimits] = useState(null);
    const [spend, setSpend] = useState(null);
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
    // Subscription limits live on usage-store (via dash proxy at /api/usage/limits).
    // No basePath — this endpoint is site-global, not bridge-specific.
    const fetchLimits = useCallback(async () => {
        try {
            const res = await apiFetch('/api/usage/limits');
            if (res.ok)
                setLimits(await res.json());
        }
        catch { /* ignore */ }
    }, [apiFetch]);
    // API spend (Anthropic admin cost_report + OpenAI admin costs). Refreshed
    // hourly on the server; the UI just reads the latest snapshot.
    const fetchSpend = useCallback(async () => {
        try {
            const res = await apiFetch('/api/usage/spend');
            if (res.ok)
                setSpend(await res.json());
        }
        catch { /* ignore */ }
    }, [apiFetch]);
    useEffect(() => { fetchSessions(); }, [fetchSessions]);
    useEffect(() => {
        fetchLimits();
        const t = setInterval(fetchLimits, 60000);
        return () => clearInterval(t);
    }, [fetchLimits]);
    useEffect(() => {
        fetchSpend();
        const t = setInterval(fetchSpend, 5 * 60_000);
        return () => clearInterval(t);
    }, [fetchSpend]);
    const periodSessions = useMemo(() => {
        const cutoff = periodCutoff(period);
        return sessions.filter(s => s.created_at >= cutoff);
    }, [sessions, period]);
    const usageMapRef = useRef(usageMap);
    usageMapRef.current = usageMap;
    useEffect(() => {
        const current = usageMapRef.current;
        const toLoad = periodSessions.filter(s => (s.state === 'completed' || s.state === 'idle' || s.state === 'running') && !current.has(s.bridge_id)).slice(0, 20);
        if (toLoad.length === 0)
            return;
        setLoadingUsage(true);
        (async () => {
            const newEntries = new Map(current);
            for (const s of toLoad) {
                try {
                    const res = await apiFetch(`${basePath}/sessions/${s.bridge_id}/messages`);
                    if (!res.ok)
                        continue;
                    const msgs = await res.json() ?? [];
                    let input = 0, output = 0, cost = 0, duration = 0, turns = 0;
                    let model = '';
                    for (const m of msgs) {
                        if (m.role === 'assistant' && m.meta) {
                            input += m.meta.usage?.input_tokens || 0;
                            output += m.meta.usage?.output_tokens || 0;
                            cost += m.meta.cost?.total_usd || 0;
                            duration += m.meta.duration_ms || 0;
                            turns++;
                            if (m.meta.model)
                                model = m.meta.model;
                        }
                    }
                    newEntries.set(s.bridge_id, { sessionId: s.bridge_id, harness: s.harness, instanceId: s.instance_id ?? '', inputTokens: input, outputTokens: output, cost, durationMs: duration, model, turns });
                }
                catch { /* skip */ }
            }
            setUsageMap(newEntries);
            setLoadingUsage(false);
        })();
    }, [periodSessions, apiFetch, basePath]);
    const harnessGroups = useMemo(() => {
        const groups = new Map();
        for (const s of periodSessions) {
            const usage = usageMap.get(s.bridge_id);
            if (!usage)
                continue;
            let g = groups.get(s.harness);
            if (!g) {
                g = { sessions: [], totals: { input: 0, output: 0, cost: 0, duration: 0, turns: 0 } };
                groups.set(s.harness, g);
            }
            g.sessions.push(usage);
            g.totals.input += usage.inputTokens;
            g.totals.output += usage.outputTokens;
            g.totals.cost += usage.cost;
            g.totals.duration += usage.durationMs;
            g.totals.turns += usage.turns;
        }
        return groups;
    }, [periodSessions, usageMap]);
    const totals = useMemo(() => {
        let input = 0, output = 0, cost = 0, duration = 0, count = 0;
        for (const [, g] of harnessGroups) {
            input += g.totals.input;
            output += g.totals.output;
            cost += g.totals.cost;
            duration += g.totals.duration;
            count += g.sessions.length;
        }
        return { input, output, cost, duration, count };
    }, [harnessGroups]);
    return (_jsxs("div", { className: "bu-container", children: [_jsxs("div", { className: "bu-header", children: [_jsx("h2", { children: "Bridge Usage" }), _jsx("div", { className: "bu-period-tabs", children: ['day', 'week', 'month'].map(p => (_jsx("button", { className: `bu-tab ${period === p ? 'bu-tab-active' : ''}`, onClick: () => setPeriod(p), children: p === 'day' ? '24h' : p === 'week' ? '7d' : '30d' }, p))) })] }), spend && (_jsx("div", { className: "bu-spend-section", children: ['anthropic', 'openai'].map(provider => {
                    const p = spend[provider];
                    return (_jsxs("div", { className: "bu-spend-provider", children: [_jsxs("div", { className: "bu-spend-header", children: [_jsx("span", { className: "bu-spend-title", children: SPEND_PROVIDER_LABELS[provider] }), !p.configured && _jsx("span", { className: "bu-spend-unconfigured", children: "admin key not configured" })] }), p.configured ? (_jsx("div", { className: "bu-spend-grid", children: ['day', 'week', 'month'].map(w => {
                                    const snap = p.windows[w];
                                    return (_jsxs("div", { className: "bu-spend-cell", children: [_jsx("span", { className: "bu-spend-window", children: SPEND_WINDOW_LABELS[w] }), _jsx("span", { className: "bu-spend-amount", children: snap ? `$${snap.total_usd.toFixed(2)}` : '—' }), snap && (_jsxs("span", { className: "bu-spend-fetched", title: new Date(snap.fetched_at * 1000).toLocaleString(), children: ["as of ", new Date(snap.fetched_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })] }))] }, w));
                                }) })) : (_jsxs("div", { className: "bu-spend-hint", children: ["Set ", _jsxs("code", { children: ["USAGE_STORE_", provider === 'anthropic' ? 'ANTHROPIC' : 'OPENAI', "_ADMIN_CRED_ID"] }), " on usage-store after storing an admin key in auth-store."] }))] }, provider));
                }) })), limits && (_jsx("div", { className: "bu-limits-section", children: Object.entries(limits).map(([provider, p]) => {
                    if (!p)
                        return null;
                    const stale = p.stale_after != null && Date.now() / 1000 > p.stale_after;
                    const windowEntries = Object.entries(p.windows).filter(([, w]) => w.used_percent > 0 || w.resets_at != null);
                    if (windowEntries.length === 0)
                        return null;
                    return (_jsxs("div", { className: "bu-limits-provider", children: [_jsxs("div", { className: "bu-limits-header", children: [_jsx("span", { className: "bu-limits-title", children: PROVIDER_LABELS[provider] ?? provider }), p.plan_type && _jsxs("span", { className: "bu-limits-tier", children: [p.plan_type, p.tier?.includes('20x') ? ' 20x' : p.tier?.includes('5x') ? ' 5x' : ''] }), stale && _jsx("span", { className: "bu-limits-stale", title: `snapshot from ${new Date(p.snapshot_at * 1000).toLocaleString()}`, children: "stale" })] }), _jsx("div", { className: "bu-limits-grid", children: windowEntries.map(([key, win]) => (_jsx(LimitBar, { label: WINDOW_LABELS[key] ?? key, win: win }, key))) })] }, provider));
                }) })), loading ? (_jsx("div", { className: "bu-loading", children: "Loading..." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bu-totals-row", children: [_jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Sessions" }), _jsx("span", { className: "bu-total-value", children: totals.count })] }), _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Input" }), _jsx("span", { className: "bu-total-value", children: formatTokens(totals.input) })] }), _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Output" }), _jsx("span", { className: "bu-total-value", children: formatTokens(totals.output) })] }), totals.cost > 0 && _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Cost" }), _jsxs("span", { className: "bu-total-value", children: ["$", totals.cost.toFixed(2)] })] }), _jsxs("div", { className: "bu-total-card", children: [_jsx("span", { className: "bu-total-label", children: "Time" }), _jsx("span", { className: "bu-total-value", children: formatDuration(totals.duration) })] })] }), loadingUsage && _jsx("div", { className: "bu-loading-small", children: "Loading session details..." }), Array.from(harnessGroups.entries()).map(([harness, group]) => (_jsxs("div", { className: "bu-harness-section", children: [_jsxs("div", { className: "bu-harness-header", children: [_jsx("span", { className: "bu-harness-name", children: harness }), _jsxs("span", { className: "bu-harness-summary", children: [group.sessions.length, " sessions \u00B7 ", formatTokens(group.totals.input + group.totals.output), " tokens", group.totals.cost > 0 && ` \u00B7 $${group.totals.cost.toFixed(2)}`] })] }), _jsxs("div", { className: "bu-token-bar", children: [_jsx("div", { className: "bu-token-bar-in", style: { width: `${(group.totals.input / (group.totals.input + group.totals.output || 1)) * 100}%` } }), _jsx("div", { className: "bu-token-bar-out", style: { width: `${(group.totals.output / (group.totals.input + group.totals.output || 1)) * 100}%` } })] }), _jsx("div", { className: "bu-session-list", children: group.sessions.sort((a, b) => b.cost - a.cost).map(u => {
                                    const instance = inst.instanceMap.get(u.instanceId);
                                    return (_jsxs("div", { className: "bu-session-row", children: [_jsx("span", { className: "bu-session-id", children: u.sessionId.slice(0, 16) }), instance && _jsx("span", { className: "bu-instance-label", children: instance.name }), _jsx("span", { className: "bu-session-model", children: u.model?.replace(/^claude-/, '').replace(/\[.*$/, '') }), _jsxs("span", { children: [u.turns, " turns"] }), _jsxs("span", { children: [formatTokens(u.inputTokens), " in"] }), _jsxs("span", { children: [formatTokens(u.outputTokens), " out"] }), u.cost > 0 && _jsxs("span", { children: ["$", u.cost.toFixed(3)] }), u.durationMs > 0 && _jsx("span", { children: formatDuration(u.durationMs) })] }, u.sessionId));
                                }) })] }, harness))), harnessGroups.size === 0 && !loadingUsage && (_jsx("div", { className: "bu-empty", children: "No usage data for this period" }))] }))] }));
}
//# sourceMappingURL=BridgeUsage.js.map