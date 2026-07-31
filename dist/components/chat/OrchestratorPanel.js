import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../../context';
const ORDER = ['agents', 'tasks', 'convo_summary', 'convo_current'];
const LINK_RE = /\[(session|task|todo):([^\]]+)\]/g;
// Where a [kind:id] reference points on THIS host. Every path comes from the
// consumer's `routes`, never from a literal: the same panel runs in a host that
// mounts chat at `/` and in one that mounts it at `/bridge`. An empty route
// means the host has no such page, and the reference renders as plain text
// rather than as a link to somewhere that doesn't exist.
function hrefFor(routes, kind, id) {
    if (kind === 'session')
        return `${routes.chat}?session=${encodeURIComponent(id)}`;
    if (kind === 'task')
        return routes.kanban;
    if (kind === 'todo')
        return routes.notes;
    return '';
}
function Linkified({ text, routes }) {
    const out = [];
    let last = 0, i = 0, m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
        if (m.index > last)
            out.push(text.slice(last, m.index));
        const [tok, kind, id] = m;
        const href = hrefFor(routes, kind, id);
        out.push(href
            ? _jsx("a", { href: href, style: { color: 'var(--accent,#818cf8)' }, children: tok }, i++)
            : _jsx("span", { children: tok }, i++));
        last = m.index + tok.length;
    }
    if (last < text.length)
        out.push(text.slice(last));
    return _jsx(_Fragment, { children: out });
}
export function OrchestratorPanel({ onToggleCollapse, style }) {
    const { fetch: apiFetch, producerBasePath, routes } = useBridgeConfig();
    const [parts, setParts] = useState([]);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        if (!producerBasePath)
            return;
        try {
            const r = await apiFetch(`${producerBasePath}/context`);
            if (!r.ok)
                throw new Error(`HTTP ${r.status}`);
            setParts(await r.json());
            setError(null);
        }
        catch (e) {
            setError(String(e.message ?? e));
        }
    }, [apiFetch, producerBasePath]);
    useEffect(() => {
        if (!producerBasePath)
            return;
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [load, producerBasePath]);
    const ordered = [
        ...ORDER.map(id => parts.find(p => p.part === id)).filter(Boolean),
        ...parts.filter(p => !ORDER.includes(p.part)),
    ];
    const total = ordered.reduce((a, p) => a + (p.latest?.tokens ?? 0), 0);
    return (_jsxs("div", { className: "bc-split-pane", style: style, "data-pane": "orchestrator", children: [_jsxs("div", { className: "bc-split-pane-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse();
                } }, role: "button", tabIndex: 0, title: "Hide orchestrator context", children: [_jsx("span", { className: "bc-split-pane-title", children: "\uD83C\uDFAC Orchestrator context" }), _jsx("span", { className: "bc-spacer" }), _jsxs("span", { style: { fontSize: 12, opacity: 0.7 }, children: ["~", total.toLocaleString(), " tok"] }), routes.orchestrator && (_jsx("a", { href: routes.orchestrator, onClick: e => e.stopPropagation(), title: "Open full review page", style: { marginLeft: 8, textDecoration: 'none' }, children: "\u2197" })), _jsx("span", { className: "bc-split-collapse-btn", "aria-hidden": "true", style: { marginLeft: 8 }, children: "\u00D7" })] }), _jsxs("div", { style: { overflow: 'auto', padding: 8, fontSize: 12 }, children: [!producerBasePath && _jsx("div", { style: { opacity: 0.7 }, children: "No producer configured \u2014 set producerBasePath on BridgeProvider." }), error && _jsxs("div", { style: { color: '#ef4444' }, children: ["Producer offline (", error, ")"] }), ordered.map(p => (_jsxs("details", { open: p.part === 'agents' || p.part === 'tasks', style: { marginBottom: 8 }, children: [_jsxs("summary", { style: { cursor: 'pointer', opacity: 0.85 }, children: [p.title, " ", _jsxs("span", { style: { opacity: 0.5 }, children: ["\u00B7 ~", p.latest.tokens.toLocaleString(), " tok \u00B7 v", p.version_count] })] }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 11.5 }, children: _jsx(Linkified, { text: p.latest.content, routes: routes }) })] }, p.part)))] })] }));
}
//# sourceMappingURL=OrchestratorPanel.js.map