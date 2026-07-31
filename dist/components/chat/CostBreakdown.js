import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { formatCost } from '../../utils';
// ceilingTone grades spend against the ceiling for the chip's colour.
// Matches the context-tokens thresholds SessionHeader already uses, so the
// two budget-ish readouts in the header change colour on the same scale.
function ceilingTone(spendUSD, maxBudgetUSD) {
    if (maxBudgetUSD <= 0)
        return '';
    const pct = (spendUSD / maxBudgetUSD) * 100;
    if (pct >= 90)
        return 'crit';
    if (pct >= 70)
        return 'warn';
    return '';
}
export function CostBreakdown({ rows, fallbackTotalUSD = 0, fallbackTitle, aggregate, ceiling }) {
    const apiSpend = latestApiSpend(rows ?? []);
    // With a ceiling, the chip reads "$3.00 / $10.00" and the ceiling's own
    // pair drives both the text and the colour — see SpendCeiling for why it
    // is that pair and not the drill-down's figure.
    const tone = ceiling ? ceilingTone(ceiling.spendUSD, ceiling.maxBudgetUSD) : '';
    const chipClass = ceiling ? ` bc-cost-ceiling${tone ? ` bc-cost-ceiling-${tone}` : ''}` : '';
    const ceilingLabel = ceiling
        ? `${formatCost(ceiling.spendUSD)} / ${formatCost(ceiling.maxBudgetUSD)}`
        : '';
    const ceilingTitle = ceiling
        ? `${formatCost(ceiling.spendUSD)} spent of this session's ${formatCost(ceiling.maxBudgetUSD)} ceiling — bridge-server stops the session here`
        : '';
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const onDocClick = (e) => {
            if (!ref.current)
                return;
            if (!ref.current.contains(e.target))
                setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    // Pre-aggregated path: a consumer handed us a finished cost object, so
    // render the chip + drill-down straight from it without touching the
    // rows/fallback logic below.
    if (aggregate) {
        const byModel = mapEntriesSortedDesc(aggregate.byModel);
        const bySource = mapEntriesSortedDesc(aggregate.bySource);
        return (_jsxs("div", { className: "bc-cost-wrap", ref: ref, children: [_jsxs("button", { type: "button", className: `bc-cost bc-cost-clickable${chipClass}${open ? ' bc-cost-open' : ''}`, onClick: () => setOpen(o => !o), title: ceiling ? `${ceilingTitle}\nclick for breakdown` : 'click for breakdown', "aria-expanded": open, children: [ceiling ? ceilingLabel : formatCost(aggregate.totalUsd), _jsx("span", { className: "bc-cost-caret", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsxs("div", { className: "bc-cost-panel", role: "dialog", "aria-label": "Cost breakdown", children: [_jsx(CeilingPanelRows, { ceiling: ceiling }), _jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-total", children: [_jsx("span", { className: "bc-cost-panel-label", children: "API spend" }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(aggregate.totalUsd) })] }), byModel.length > 0 && (_jsxs("div", { className: "bc-cost-panel-group", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "By model" }), byModel.map(([k, v]) => (_jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: k }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(v) })] }, `m_${k}`)))] })), bySource.length > 0 && (_jsxs("div", { className: "bc-cost-panel-group", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "By source" }), bySource.map(([k, v]) => (_jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: k }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(v) })] }, `s_${k}`)))] }))] }))] }));
    }
    if (apiSpend && apiSpend.calls > 0) {
        const callsTitle = `${apiSpend.calls} API call${apiSpend.calls === 1 ? '' : 's'} · click for breakdown`;
        return (_jsxs("div", { className: "bc-cost-wrap", ref: ref, children: [_jsxs("button", { type: "button", className: `bc-cost bc-cost-clickable${chipClass}${open ? ' bc-cost-open' : ''}`, onClick: () => setOpen(o => !o), title: ceiling ? `${ceilingTitle}\n${callsTitle}` : callsTitle, "aria-expanded": open, children: [ceiling ? ceilingLabel : formatCost(apiSpend.total_usd), _jsx("span", { className: "bc-cost-caret", "aria-hidden": true, children: "\u25BE" })] }), open && _jsx(CostDrilldownPanel, { spend: apiSpend, fallbackTotalUSD: fallbackTotalUSD, ceiling: ceiling })] }));
    }
    if (ceiling) {
        // A ceiling with no api_call telemetry behind it. Worth showing — the
        // ceiling is a fact the user set, and the session's spend against it is
        // the number the server gates on whether or not any call has been
        // itemised yet.
        //
        // This branch renders the same clickable chip as the others rather than
        // a static one. It used to be a bare span, which made the drill-down
        // unreachable in exactly the state that reaches it: a session with a
        // ceiling and no itemised calls, i.e. every freshly-loaded one. A group
        // of rows nothing can open is a group of rows that does not exist.
        return (_jsxs("div", { className: "bc-cost-wrap", ref: ref, children: [_jsxs("button", { type: "button", className: `bc-cost bc-cost-clickable${chipClass}${open ? ' bc-cost-open' : ''}`, onClick: () => setOpen(o => !o), title: `${ceilingTitle}\nclick for breakdown`, "aria-expanded": open, children: [ceilingLabel, _jsx("span", { className: "bc-cost-caret", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsx("div", { className: "bc-cost-panel", role: "dialog", "aria-label": "Cost breakdown", children: _jsx(CeilingPanelRows, { ceiling: ceiling }) }))] }));
    }
    if (fallbackTotalUSD > 0) {
        return (_jsx("span", { className: "bc-cost", title: fallbackTitle, children: formatCost(fallbackTotalUSD) }));
    }
    return null;
}
// CeilingPanelRows adds the gated pair to a drill-down panel. Renders
// nothing without a ceiling, which is every session that has none.
//
// It is a separate row rather than a footnote on "API spend" because the
// two figures answer different questions and can hold different numbers:
// this one is what the server compares, that one is what the session has
// been billed for as best the client can tell.
function CeilingPanelRows({ ceiling }) {
    if (!ceiling)
        return null;
    const remaining = ceiling.maxBudgetUSD - ceiling.spendUSD;
    return (_jsxs("div", { className: "bc-cost-panel-group bc-cost-panel-ceiling", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "Spend ceiling" }), _jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: "gated spend" }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(ceiling.spendUSD) })] }), _jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: "ceiling" }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(ceiling.maxBudgetUSD) })] }), _jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: remaining > 0 ? 'remaining' : 'over by' }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(Math.abs(remaining)) })] })] }));
}
function CostDrilldownPanel({ spend, fallbackTotalUSD, ceiling }) {
    const byModel = mapEntriesSortedDesc(spend.by_model);
    const bySource = mapEntriesSortedDesc(spend.by_query_source);
    // The delta exists when EventResult.Cost was recording a smaller number
    // than per-call OTel: that's the auxiliary-call overhead (session-title
    // generation, prompt-suggestion). Surface it explicitly rather than
    // forcing users to subtract.
    const overhead = fallbackTotalUSD > 0 ? spend.total_usd - fallbackTotalUSD : 0;
    const showOverhead = fallbackTotalUSD > 0 && overhead > 0.000001;
    return (_jsxs("div", { className: "bc-cost-panel", role: "dialog", "aria-label": "Cost breakdown", children: [_jsx(CeilingPanelRows, { ceiling: ceiling }), _jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-total", children: [_jsx("span", { className: "bc-cost-panel-label", children: "API spend" }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(spend.total_usd) })] }), _jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-sub", children: [_jsxs("span", { className: "bc-cost-panel-label", children: [spend.calls, " call", spend.calls === 1 ? '' : 's'] }), _jsxs("span", { className: "bc-cost-panel-value", children: [(spend.usage?.input_tokens ?? 0).toLocaleString(), " in", ' / ', (spend.usage?.output_tokens ?? 0).toLocaleString(), " out"] })] }), showOverhead && (_jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-overhead", children: [_jsx("span", { className: "bc-cost-panel-label", children: "vs. turn cost" }), _jsxs("span", { className: "bc-cost-panel-value", children: ["+", formatCost(overhead), " aux"] })] })), byModel.length > 0 && (_jsxs("div", { className: "bc-cost-panel-group", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "By model" }), byModel.map(([k, v]) => (_jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: k }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(v) })] }, `m_${k}`)))] })), bySource.length > 0 && (_jsxs("div", { className: "bc-cost-panel-group", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "By source" }), bySource.map(([k, v]) => (_jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: k }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(v) })] }, `s_${k}`)))] }))] }));
}
// latestApiSpend scans backwards for the most recent api_spend_total row.
// The derivation emits one after every EventAPICall, so the last one in
// the stream carries the cumulative state we want to display.
function latestApiSpend(rows) {
    for (let i = rows.length - 1; i >= 0; i--) {
        const s = rows[i].apiSpendTotal;
        if (s)
            return s;
    }
    return null;
}
function mapEntriesSortedDesc(m) {
    if (!m)
        return [];
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
//# sourceMappingURL=CostBreakdown.js.map