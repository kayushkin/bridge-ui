import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
// ProducerRow is the pinned "Orchestrator" entry at the top of the sidebar.
// It is deliberately self-contained: it fetches its own state from the producer
// service (proxied at producerBasePath) using the same apiFetch the rest of the
// sidebar uses, so it needs no new provider wiring. If the service is
// unreachable the row still renders, showing an offline state rather than
// breaking the sidebar.
export function ProducerRow({ apiFetch, producerBasePath, orchestratorPath }) {
    const [cfg, setCfg] = useState(null);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [limitDraft, setLimitDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => {
        apiFetch(`${producerBasePath}/config`)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(`config ${r.status}`);
            const c = await r.json();
            setCfg(c);
            setLimitDraft(String(c.week_limit_usd));
            setError(null);
        })
            .catch(e => setError(String(e?.message ?? e)));
    }, [apiFetch, producerBasePath]);
    useEffect(() => { load(); }, [load]);
    const patch = useCallback(async (body) => {
        setBusy(true);
        try {
            const r = await apiFetch(`${producerBasePath}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!r.ok)
                throw new Error(`save ${r.status}`);
            const c = await r.json();
            setCfg(c);
            setLimitDraft(String(c.week_limit_usd));
            setError(null);
        }
        catch (e) {
            setError(String(e?.message ?? e));
        }
        finally {
            setBusy(false);
        }
    }, [apiFetch, producerBasePath]);
    const resetWeek = useCallback(async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`${producerBasePath}/config/reset-week`, { method: 'POST' });
            if (!r.ok)
                throw new Error(`reset ${r.status}`);
            const c = await r.json();
            setCfg(c);
            setError(null);
        }
        catch (e) {
            setError(String(e?.message ?? e));
        }
        finally {
            setBusy(false);
        }
    }, [apiFetch, producerBasePath]);
    const enabled = cfg?.enabled ?? false;
    const unreachable = !cfg && !!error;
    // The orchestrator is NOT a chat session — it's a stateless-per-run runtime —
    // so the row opens its dedicated surface page, not a bridge session. A host
    // that mounts no such page gets the settings panel instead of a dead link.
    const openReviewPage = useCallback(() => {
        if (orchestratorPath)
            window.location.assign(orchestratorPath);
        else
            setExpanded(x => !x);
    }, [orchestratorPath]);
    const saveLimit = () => {
        const v = parseFloat(limitDraft);
        if (!Number.isNaN(v) && v >= 0 && v !== cfg?.week_limit_usd)
            patch({ week_limit_usd: v });
    };
    const pct = cfg && cfg.week_limit_usd > 0
        ? Math.min(100, (100 * cfg.week_spent_usd) / cfg.week_limit_usd)
        : 0;
    return (_jsxs("div", { className: `bc-producer ${enabled ? 'bc-producer-enabled' : ''}`, children: [_jsxs("div", { className: "bc-session-item bc-producer-row", children: [_jsxs("button", { className: "bc-session-item-main", onClick: openReviewPage, title: unreachable
                            ? 'Orchestrator service unreachable'
                            : orchestratorPath ? 'Open the Orchestrator review page' : 'Orchestrator settings', children: [_jsx("span", { className: "bc-session-harness bc-producer-badge", "aria-hidden": true, children: "\uD83C\uDFAC" }), _jsx("span", { className: `bc-producer-dot ${unreachable ? 'off' : enabled ? 'on' : 'idle'}` }), _jsx("span", { className: "bc-session-label bc-producer-label", children: "Orchestrator" })] }), _jsx("span", { className: "bc-session-menu-btn bc-producer-caret", role: "button", tabIndex: 0, onClick: () => setExpanded(x => !x), title: "Orchestrator settings", children: expanded ? '▾' : '⚙' })] }), expanded && (_jsx("div", { className: "bc-producer-panel", children: unreachable ? (_jsxs("div", { className: "bc-producer-error", children: ["Orchestrator offline (", error, ")"] })) : cfg ? (_jsxs(_Fragment, { children: [orchestratorPath && _jsx("div", { className: "bc-producer-hint", children: "Click the row to open the review page." }), _jsx("button", { className: `bc-producer-enable ${enabled ? 'on' : 'off'}`, disabled: busy, onClick: () => patch({ enabled: !enabled }), title: "Autonomous mode: lets the Orchestrator run scheduled sweeps and ping you. Chatting works either way.", children: enabled ? '● Autonomous mode on — click to disable' : '○ Enable autonomous mode' }), _jsxs("label", { className: "bc-producer-limit", children: [_jsx("span", { children: "Weekly limit\u00A0$" }), _jsx("input", { type: "number", min: "0", step: "1", value: limitDraft, disabled: busy, onChange: e => setLimitDraft(e.target.value), onBlur: saveLimit, onKeyDown: e => { if (e.key === 'Enter')
                                        e.target.blur(); } })] }), _jsxs("div", { className: "bc-producer-meter", children: [_jsx("div", { className: "bc-producer-meter-bar", children: _jsx("div", { className: "bc-producer-meter-fill", style: { width: `${pct}%` } }) }), _jsxs("div", { className: "bc-producer-meter-label", children: ["$", cfg.week_spent_usd.toFixed(2), " spent \u00B7 $", cfg.week_remaining_usd.toFixed(2), " left this week"] })] }), _jsxs("div", { className: "bc-producer-actions", children: [_jsxs("span", { className: "bc-producer-reset-note", children: ["resets ", new Date(cfg.week_resets_at).toLocaleDateString()] }), _jsx("button", { className: "bc-producer-reset", disabled: busy, onClick: resetWeek, children: "Reset week" })] }), error && _jsx("div", { className: "bc-producer-error", children: error })] })) : (_jsx("div", { className: "bc-producer-loading", children: "Loading\u2026" })) }))] }));
}
//# sourceMappingURL=ProducerRow.js.map