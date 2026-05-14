import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { formatCost } from '../../utils';
// CostBreakdown renders the session's running cost. When an
// EventAPISpendTotal (server-derived from per-call OTel telemetry) has
// landed, its cumulative TotalUSD is canonical and the chip opens a
// drill-down with ByModel + ByQuerySource breakdowns. When the session
// has no api_call telemetry yet (legacy claudecode runs, harnesses that
// don't emit it), the chip falls back to the per-turn EventResult.Cost
// sum the SessionHeader was computing before.
//
// "Fallback" here is presentation-layer pick-the-best-source, not data
// fabrication: each path reads a real signal the session actually
// produced. Nothing is invented to fill in missing data.
export function CostBreakdown({ rows, fallbackTotalUSD, fallbackTitle }) {
    const apiSpend = latestApiSpend(rows);
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
    if (apiSpend && apiSpend.calls > 0) {
        return (_jsxs("div", { className: "bc-cost-wrap", ref: ref, children: [_jsxs("button", { type: "button", className: `bc-cost bc-cost-clickable${open ? ' bc-cost-open' : ''}`, onClick: () => setOpen(o => !o), title: `${apiSpend.calls} API call${apiSpend.calls === 1 ? '' : 's'} · click for breakdown`, "aria-expanded": open, children: [formatCost(apiSpend.total_usd), _jsx("span", { className: "bc-cost-caret", "aria-hidden": true, children: "\u25BE" })] }), open && _jsx(CostDrilldownPanel, { spend: apiSpend, fallbackTotalUSD: fallbackTotalUSD })] }));
    }
    if (fallbackTotalUSD > 0) {
        return (_jsx("span", { className: "bc-cost", title: fallbackTitle, children: formatCost(fallbackTotalUSD) }));
    }
    return null;
}
function CostDrilldownPanel({ spend, fallbackTotalUSD }) {
    const byModel = mapEntriesSortedDesc(spend.by_model);
    const bySource = mapEntriesSortedDesc(spend.by_query_source);
    // The delta exists when EventResult.Cost was recording a smaller number
    // than per-call OTel: that's the auxiliary-call overhead (session-title
    // generation, prompt-suggestion). Surface it explicitly rather than
    // forcing users to subtract.
    const overhead = fallbackTotalUSD > 0 ? spend.total_usd - fallbackTotalUSD : 0;
    const showOverhead = fallbackTotalUSD > 0 && overhead > 0.000001;
    return (_jsxs("div", { className: "bc-cost-panel", role: "dialog", "aria-label": "Cost breakdown", children: [_jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-total", children: [_jsx("span", { className: "bc-cost-panel-label", children: "API spend" }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(spend.total_usd) })] }), _jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-sub", children: [_jsxs("span", { className: "bc-cost-panel-label", children: [spend.calls, " call", spend.calls === 1 ? '' : 's'] }), _jsxs("span", { className: "bc-cost-panel-value", children: [(spend.usage?.input_tokens ?? 0).toLocaleString(), " in", ' / ', (spend.usage?.output_tokens ?? 0).toLocaleString(), " out"] })] }), showOverhead && (_jsxs("div", { className: "bc-cost-panel-row bc-cost-panel-overhead", children: [_jsx("span", { className: "bc-cost-panel-label", children: "vs. turn cost" }), _jsxs("span", { className: "bc-cost-panel-value", children: ["+", formatCost(overhead), " aux"] })] })), byModel.length > 0 && (_jsxs("div", { className: "bc-cost-panel-group", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "By model" }), byModel.map(([k, v]) => (_jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: k }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(v) })] }, `m_${k}`)))] })), bySource.length > 0 && (_jsxs("div", { className: "bc-cost-panel-group", children: [_jsx("div", { className: "bc-cost-panel-group-label", children: "By source" }), bySource.map(([k, v]) => (_jsxs("div", { className: "bc-cost-panel-row", children: [_jsx("span", { className: "bc-cost-panel-label", children: k }), _jsx("span", { className: "bc-cost-panel-value", children: formatCost(v) })] }, `s_${k}`)))] }))] }));
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