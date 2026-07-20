import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBridgeConfig } from '../../../context';
import { formatCost, timeAgo } from '../../../utils';
import { idTail } from '../utils';
import { fetchSessionRef, fetchTodoRef } from './refData';
function readNodeProp(props, key) {
    const v = props.node?.properties?.[key];
    return typeof v === 'string' ? v : undefined;
}
export function RefChip(props) {
    const kind = readNodeProp(props, 'kind');
    const refId = readNodeProp(props, 'refId');
    // A malformed node with no id can't resolve to anything; render the raw text
    // rather than an empty chip so nothing is silently dropped.
    if (!kind || !refId)
        return _jsx(_Fragment, { children: refId ?? '' });
    return _jsx(RefChipInner, { kind: kind, refId: refId });
}
function RefChipInner({ kind, refId }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const onDocClick = (e) => {
            if (!wrapRef.current)
                return;
            if (!wrapRef.current.contains(e.target))
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
    return (_jsxs("span", { className: "bc-ref-wrap", ref: wrapRef, children: [_jsxs("button", { type: "button", className: `bc-ref bc-ref-${kind}${open ? ' bc-ref-open' : ''}`, onClick: () => setOpen(o => !o), "aria-expanded": open, title: `${kind === 'session' ? 'Session' : 'Todo'} ${refId} · click for details`, children: [_jsx("span", { className: "bc-ref-glyph", "aria-hidden": true, children: kind === 'session' ? '⧉' : '☑' }), _jsx("span", { className: "bc-ref-id", children: idTail(refId, 12) }), _jsx("span", { className: "bc-ref-caret", "aria-hidden": true, children: "\u25BE" })] }), open && (kind === 'session'
                ? _jsx(SessionRefPanel, { refId: refId })
                : _jsx(TodoRefPanel, { refId: refId }))] }));
}
// Small state machine shared by both panels: idle → loading → loaded | error.
// Fetch is lazy — it fires on first open only.
function useRefLoad(loader) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let live = true;
        setLoading(true);
        setError(null);
        loader().then(d => { if (live) {
            setData(d);
            setLoading(false);
        } }, (e) => { if (live) {
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
        } });
        return () => { live = false; };
        // loader identity is stable per-open (panel mounts on open); refId is the
        // real dependency and it's baked into loader.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return { data, error, loading };
}
function SessionRefPanel({ refId }) {
    const cfg = useBridgeConfig();
    const { data, error, loading } = useRefLoad(() => fetchSessionRef(cfg.fetch, cfg.basePath, refId));
    return (_jsxs("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Session details", children: [loading && _jsx("div", { className: "bc-ref-panel-loading", children: "Loading session\u2026" }), error && _jsxs("div", { className: "bc-ref-panel-error", children: ["Couldn\u2019t load session: ", error] }), data && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-ref-panel-title", children: data.display_name || '(untitled session)' }), _jsx(RefRow, { label: "State", value: data.state, badge: stateBadge(data.state) }), data.type && _jsx(RefRow, { label: "Type", value: data.type }), data.model && _jsx(RefRow, { label: "Model", value: data.model }), data.harness && _jsx(RefRow, { label: "Harness", value: data.harness }), data.cost_usd != null && data.cost_usd > 0 && (_jsx(RefRow, { label: "Cost", value: formatCost(data.cost_usd) })), data.updated_at && _jsx(RefRow, { label: "Updated", value: timeAgo(data.updated_at) }), _jsx("div", { className: "bc-ref-panel-actions", children: _jsx(Link, { className: "bc-ref-panel-link", to: `${cfg.routes.chat}?session=${encodeURIComponent(refId)}`, children: "Open chat \u2192" }) })] }))] }));
}
function TodoRefPanel({ refId }) {
    const cfg = useBridgeConfig();
    const { data, error, loading } = useRefLoad(() => fetchTodoRef(cfg.fetch, cfg.noteboardBasePath, refId));
    if (!cfg.noteboardBasePath) {
        return (_jsx("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Todo details", children: _jsx("div", { className: "bc-ref-panel-loading", children: "Todo lookup isn\u2019t configured here." }) }));
    }
    return (_jsxs("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Todo details", children: [loading && _jsx("div", { className: "bc-ref-panel-loading", children: "Loading todo\u2026" }), error && _jsxs("div", { className: "bc-ref-panel-error", children: ["Couldn\u2019t load todo: ", error] }), data && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-ref-panel-title", children: data.title || '(untitled todo)' }), _jsx(RefRow, { label: "Status", value: data.status, badge: data.held_at ? 'held' : (data.deleted_at ? 'deleted' : undefined) }), data.priority != null && data.priority !== 0 && _jsx(RefRow, { label: "Priority", value: String(data.priority) }), data.tags && data.tags.length > 0 && _jsx(RefRow, { label: "Tags", value: data.tags.join(', ') }), data.due_at && _jsx(RefRow, { label: "Due", value: timeAgo(data.due_at) }), data.updated_at && _jsx(RefRow, { label: "Updated", value: timeAgo(data.updated_at) })] }))] }));
}
function RefRow({ label, value, badge }) {
    return (_jsxs("div", { className: "bc-ref-panel-row", children: [_jsx("span", { className: "bc-ref-panel-label", children: label }), _jsxs("span", { className: "bc-ref-panel-value", children: [value, badge && _jsx("span", { className: `bc-ref-badge bc-ref-badge-${badge}`, children: badge })] })] }));
}
// A tiny presentation map: the "needs you" states get a badge so a question or
// a blocked approval stands out in the chip panel.
function stateBadge(state) {
    if (state === 'awaiting_user')
        return 'question';
    if (state === 'awaiting_permission')
        return 'approval';
    return undefined;
}
//# sourceMappingURL=RefChip.js.map