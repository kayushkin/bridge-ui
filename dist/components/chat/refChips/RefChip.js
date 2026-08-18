import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBridgeConfig } from '../../../context';
import { formatCost, timeAgo } from '../../../utils';
import { idTail } from '../utils';
import { SessionSignals } from '../SessionSignals';
import { fetchSessionCore, fetchSessionCost, fetchTodoRef, sessionEmoji, } from './refData';
function readNodeProp(props, key) {
    const v = props.node?.properties?.[key];
    return typeof v === 'string' ? v : undefined;
}
function truncate(s, n = 24) {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
export function RefChip(props) {
    const kind = readNodeProp(props, 'kind');
    const refId = readNodeProp(props, 'refId');
    // A malformed node with no id can't resolve to anything; render the raw text
    // rather than an empty chip so nothing is silently dropped.
    if (!kind || !refId)
        return _jsx(_Fragment, { children: refId ?? '' });
    return kind === 'session'
        ? _jsx(SessionChip, { refId: refId })
        : _jsx(TodoChip, { refId: refId });
}
// Lazy/eager load state machine shared by both chips: idle → loading → loaded.
function useRefLoad(loader) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        let live = true;
        loader().then(d => { if (live)
            setData(d); }, (e) => { if (live)
            setError(e instanceof Error ? e.message : String(e)); });
        return () => { live = false; };
        // loader closes over the stable refId; run once on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return { data, error };
}
// Shared dropdown open/close behaviour: click-outside + Escape, anchored to a
// wrapper ref. Returns the ref to attach and the open state + toggler.
function useDropdown() {
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
    return { open, setOpen, wrapRef };
}
function SessionChip({ refId }) {
    const cfg = useBridgeConfig();
    const { open, setOpen, wrapRef } = useDropdown();
    const { data: core, error } = useRefLoad(() => fetchSessionCore(cfg.fetch, cfg.basePath, refId));
    const emoji = core ? sessionEmoji(core.type, core.purpose, refId) : '💬';
    const label = core && core.display_name ? truncate(core.display_name) : idTail(refId, 12);
    const chatHref = `${cfg.routes.chat}?session=${encodeURIComponent(refId)}`;
    return (_jsxs("span", { className: "bc-ref-wrap", ref: wrapRef, children: [_jsxs(Link, { className: "bc-ref bc-ref-session", to: chatHref, title: `Open chat — ${core?.display_name || refId}`, children: [_jsx("span", { className: "bc-ref-glyph", "aria-hidden": true, children: emoji }), _jsx("span", { className: "bc-ref-label", children: label })] }), _jsx("button", { type: "button", className: `bc-ref-caret-btn${open ? ' bc-ref-open' : ''}`, onClick: () => setOpen(o => !o), "aria-expanded": open, "aria-label": "Session details", title: "Details", children: "\u25BE" }), open && _jsx(SessionRefPanel, { core: core, error: error, refId: refId })] }));
}
function SessionRefPanel({ core, error, refId }) {
    const cfg = useBridgeConfig();
    // Cost is the one heavy join (whole aggregates array) — fetch it only now,
    // when the panel is actually open, keyed off the already-loaded core.
    const [cost, setCost] = useState(null);
    useEffect(() => {
        if (!core)
            return;
        let live = true;
        fetchSessionCost(cfg.fetch, cfg.basePath, core.session_id || refId, core.harness_session_id)
            .then(c => { if (live)
            setCost(c); });
        return () => { live = false; };
    }, [core, cfg, refId]);
    return (_jsxs("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Session details", children: [!core && !error && _jsx("div", { className: "bc-ref-panel-loading", children: "Loading session\u2026" }), error && _jsxs("div", { className: "bc-ref-panel-error", children: ["Couldn\u2019t load session: ", error] }), core && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-ref-panel-title", children: core.display_name || '(untitled session)' }), _jsx(RefRow, { label: "State", value: core.state, badge: stateBadge(core.state) }), core.type && _jsx(RefRow, { label: "Type", value: core.purpose ? `${core.type} · ${core.purpose}` : core.type }), core.model && _jsx(RefRow, { label: "Model", value: core.model }), core.harness && _jsx(RefRow, { label: "Harness", value: core.harness }), cost != null && cost > 0 && _jsx(RefRow, { label: "Cost", value: formatCost(cost) }), core.updated_at && _jsx(RefRow, { label: "Updated", value: timeAgo(core.updated_at) }), _jsx(SessionSignals, { sessionId: core.session_id || refId, compact: true })] }))] }));
}
export function TodoChip({ refId }) {
    const cfg = useBridgeConfig();
    const { open, setOpen, wrapRef } = useDropdown();
    const configured = !!cfg.noteboardBasePath;
    const { data: todo, error } = useRefLoad(() => configured ? fetchTodoRef(cfg.fetch, cfg.noteboardBasePath, refId) : Promise.reject(new Error('noteboard not configured')));
    const label = todo && todo.title ? truncate(todo.title) : idTail(refId, 12);
    const emoji = todo ? todoEmoji(todo) : '☑';
    return (_jsxs("span", { className: "bc-ref-wrap", ref: wrapRef, children: [_jsxs("button", { type: "button", className: `bc-ref bc-ref-todo${open ? ' bc-ref-open' : ''}`, onClick: () => setOpen(o => !o), "aria-expanded": open, title: `Todo — ${todo?.title || refId}`, children: [_jsx("span", { className: "bc-ref-glyph", "aria-hidden": true, children: emoji }), _jsx("span", { className: "bc-ref-label", children: label }), _jsx("span", { className: "bc-ref-caret", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsxs("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Todo details", children: [!configured && _jsx("div", { className: "bc-ref-panel-loading", children: "Todo lookup isn\u2019t configured here." }), configured && !todo && !error && _jsx("div", { className: "bc-ref-panel-loading", children: "Loading todo\u2026" }), error && configured && _jsxs("div", { className: "bc-ref-panel-error", children: ["Couldn\u2019t load todo: ", error] }), todo && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-ref-panel-title", children: todo.title || '(untitled todo)' }), _jsx(RefRow, { label: "Status", value: todo.status, badge: todo.held_at ? 'held' : (todo.deleted_at ? 'deleted' : undefined) }), todo.priority !== 0 && _jsx(RefRow, { label: "Priority", value: String(todo.priority) }), todo.tags.length > 0 && _jsx(RefRow, { label: "Tags", value: todo.tags.join(', ') }), todo.due_at && _jsx(RefRow, { label: "Due", value: timeAgo(todo.due_at) }), todo.updated_at && _jsx(RefRow, { label: "Updated", value: timeAgo(todo.updated_at) }), cfg.routes.kanban && (_jsx(Link, { className: "bc-ref-panel-link", to: `${cfg.routes.kanban}?card=${encodeURIComponent(refId)}`, children: "Open on the board \u2197" }))] }))] }))] }));
}
function RefRow({ label, value, badge }) {
    return (_jsxs("div", { className: "bc-ref-panel-row", children: [_jsx("span", { className: "bc-ref-panel-label", children: label }), _jsxs("span", { className: "bc-ref-panel-value", children: [value, badge && _jsx("span", { className: `bc-ref-badge bc-ref-badge-${badge}`, children: badge })] })] }));
}
// The "needs you" states get a badge so a question or a blocked approval stands
// out in the chip panel.
function stateBadge(state) {
    if (state === 'awaiting_user')
        return 'question';
    if (state === 'awaiting_permission')
        return 'approval';
    return undefined;
}
function todoEmoji(todo) {
    if (todo.deleted_at)
        return '🗑';
    if (todo.held_at)
        return '⏸';
    if (todo.status === 'done')
        return '✅';
    return '☑';
}
//# sourceMappingURL=RefChip.js.map