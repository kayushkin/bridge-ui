import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../../context';
import { ProducerTextWithReferenceLinks } from './producerReferences';
const ORDER = ['agents', 'tasks', 'convo_summary', 'convo_current'];
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
    return (_jsxs("div", { className: "bc-split-pane bc-split-pane-orchestrator", style: style, "data-pane": "orchestrator", children: [_jsxs("div", { className: "bc-split-pane-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse();
                } }, role: "button", tabIndex: 0, title: "Hide orchestrator context", children: [_jsx("span", { className: "bc-split-pane-title", children: "\uD83C\uDFAC Orchestrator context" }), _jsx("span", { className: "bc-spacer" }), _jsxs("span", { style: { fontSize: 12, opacity: 0.7 }, children: ["~", total.toLocaleString(), " tok"] }), routes.orchestrator && (_jsx("a", { href: routes.orchestrator, onClick: e => e.stopPropagation(), title: "Open full review page", style: { marginLeft: 8, textDecoration: 'none' }, children: "\u2197" })), _jsx("span", { className: "bc-split-collapse-btn", "aria-hidden": "true", style: { marginLeft: 8 }, children: "\u00D7" })] }), _jsxs("div", { style: { overflow: 'auto', padding: 8, fontSize: 12 }, children: [!producerBasePath && _jsx("div", { style: { opacity: 0.7 }, children: "No producer configured \u2014 set producerBasePath on BridgeProvider." }), error && _jsxs("div", { style: { color: '#ef4444' }, children: ["Producer offline (", error, ")"] }), ordered.map(p => (_jsxs("details", { open: p.part === 'agents' || p.part === 'tasks', style: { marginBottom: 8 }, children: [_jsxs("summary", { style: { cursor: 'pointer', opacity: 0.85 }, children: [p.title, " ", _jsxs("span", { style: { opacity: 0.5 }, children: ["\u00B7 ~", p.latest.tokens.toLocaleString(), " tok \u00B7 v", p.version_count] })] }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 11.5 }, children: _jsx(ProducerTextWithReferenceLinks, { text: p.latest.content }) })] }, p.part)))] })] }));
}
//# sourceMappingURL=OrchestratorPanel.js.map