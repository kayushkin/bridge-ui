import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
const ORDER = ['agents', 'tasks', 'convo_summary', 'convo_current'];
const PRODUCER_BASE = '/api/producer';
const LINK_RE = /\[(session|task|todo):([^\]]+)\]/g;
function hrefFor(kind, id) {
    if (kind === 'session')
        return `/?session=${encodeURIComponent(id)}`;
    if (kind === 'task')
        return '/kanban';
    if (kind === 'todo')
        return '/notes';
    return '#';
}
function Linkified({ text }) {
    const out = [];
    let last = 0, i = 0, m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
        if (m.index > last)
            out.push(text.slice(last, m.index));
        const [tok, kind, id] = m;
        out.push(_jsx("a", { href: hrefFor(kind, id), style: { color: 'var(--accent,#818cf8)' }, children: tok }, i++));
        last = m.index + tok.length;
    }
    if (last < text.length)
        out.push(text.slice(last));
    return _jsx(_Fragment, { children: out });
}
export function OrchestratorPanel({ onToggleCollapse, style }) {
    const [parts, setParts] = useState([]);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        try {
            const r = await fetch(`${PRODUCER_BASE}/context`, { credentials: 'include' });
            if (!r.ok)
                throw new Error(`HTTP ${r.status}`);
            setParts(await r.json());
            setError(null);
        }
        catch (e) {
            setError(String(e.message ?? e));
        }
    }, []);
    useEffect(() => {
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [load]);
    const ordered = [
        ...ORDER.map(id => parts.find(p => p.part === id)).filter(Boolean),
        ...parts.filter(p => !ORDER.includes(p.part)),
    ];
    const total = ordered.reduce((a, p) => a + (p.latest?.tokens ?? 0), 0);
    return (_jsxs("div", { className: "bc-split-pane", style: style, "data-pane": "orchestrator", children: [_jsxs("div", { className: "bc-split-pane-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse();
                } }, role: "button", tabIndex: 0, title: "Hide orchestrator context", children: [_jsx("span", { className: "bc-split-pane-title", children: "\uD83C\uDFAC Orchestrator context" }), _jsx("span", { className: "bc-spacer" }), _jsxs("span", { style: { fontSize: 12, opacity: 0.7 }, children: ["~", total.toLocaleString(), " tok"] }), _jsx("a", { href: "/orchestrator", onClick: e => e.stopPropagation(), title: "Open full review page", style: { marginLeft: 8, textDecoration: 'none' }, children: "\u2197" }), _jsx("span", { className: "bc-split-collapse-btn", "aria-hidden": "true", style: { marginLeft: 8 }, children: "\u00D7" })] }), _jsxs("div", { style: { overflow: 'auto', padding: 8, fontSize: 12 }, children: [error && _jsxs("div", { style: { color: '#ef4444' }, children: ["Producer offline (", error, ")"] }), ordered.map(p => (_jsxs("details", { open: p.part === 'agents' || p.part === 'tasks', style: { marginBottom: 8 }, children: [_jsxs("summary", { style: { cursor: 'pointer', opacity: 0.85 }, children: [p.title, " ", _jsxs("span", { style: { opacity: 0.5 }, children: ["\u00B7 ~", p.latest.tokens.toLocaleString(), " tok \u00B7 v", p.version_count] })] }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 11.5 }, children: _jsx(Linkified, { text: p.latest.content }) })] }, p.part)))] })] }));
}
//# sourceMappingURL=OrchestratorPanel.js.map