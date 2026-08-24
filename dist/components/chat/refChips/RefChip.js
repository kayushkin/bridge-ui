import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBridgeConfig } from '../../../context';
import { formatCost, timeAgo } from '../../../utils';
import { idTail } from '../utils';
import { SessionSignals } from '../SessionSignals';
import { fetchSessionCore, fetchSessionCost, fetchNoteboardItemRef, fetchResolvedRef, sessionEmoji, } from './refData';
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
    if (kind === 'session')
        return _jsx(SessionChip, { refId: refId });
    // A bare uuid with no cue word: the host's reference resolver classifies it,
    // and the chip re-renders as whatever the id turns out to name.
    if (kind === 'uuid')
        return _jsx(UuidChip, { refId: refId });
    // note / todo cue kinds — one noteboard id space either way.
    return _jsx(NoteboardItemChip, { refId: refId });
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
export function NoteboardItemChip({ refId }) {
    const cfg = useBridgeConfig();
    const { open, setOpen, wrapRef } = useDropdown();
    const configured = !!cfg.noteboardBasePath;
    const { data: item, error } = useRefLoad(() => configured ? fetchNoteboardItemRef(cfg.fetch, cfg.noteboardBasePath, refId) : Promise.reject(new Error('noteboard not configured')));
    // The item's own `type` labels the chip — the cue word or resolver match
    // that led here only said which store to ask.
    const itemKind = item?.type || 'item';
    const label = item && item.title ? truncate(item.title) : idTail(refId, 12);
    const emoji = item ? noteboardItemEmoji(item) : '☑';
    return (_jsxs("span", { className: "bc-ref-wrap", ref: wrapRef, children: [_jsxs("button", { type: "button", className: `bc-ref bc-ref-todo${open ? ' bc-ref-open' : ''}`, onClick: () => setOpen(o => !o), "aria-expanded": open, title: `${itemKind} — ${item?.title || refId}`, children: [_jsx("span", { className: "bc-ref-glyph", "aria-hidden": true, children: emoji }), _jsx("span", { className: "bc-ref-label", children: label }), _jsx("span", { className: "bc-ref-caret", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsxs("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Noteboard item details", children: [!configured && _jsx("div", { className: "bc-ref-panel-loading", children: "Noteboard lookup isn\u2019t configured here." }), configured && !item && !error && _jsx("div", { className: "bc-ref-panel-loading", children: "Loading\u2026" }), error && configured && _jsxs("div", { className: "bc-ref-panel-error", children: ["Couldn\u2019t load item: ", error] }), item && (_jsxs(_Fragment, { children: [_jsx("div", { className: "bc-ref-panel-title", children: item.title || '(untitled)' }), item.type && _jsx(RefRow, { label: "Type", value: item.type }), _jsx(RefRow, { label: "Status", value: item.status, badge: item.held_at ? 'held' : (item.deleted_at ? 'deleted' : undefined) }), item.priority !== 0 && _jsx(RefRow, { label: "Priority", value: String(item.priority) }), item.tags.length > 0 && _jsx(RefRow, { label: "Tags", value: item.tags.join(', ') }), item.due_at && _jsx(RefRow, { label: "Due", value: timeAgo(item.due_at) }), item.updated_at && _jsx(RefRow, { label: "Updated", value: timeAgo(item.updated_at) }), cfg.routes.kanban && (_jsx(Link, { className: "bc-ref-panel-link", to: `${cfg.routes.kanban}?card=${encodeURIComponent(refId)}`, children: "Open on the board \u2197" }))] }))] }))] }));
}
/**
 * A bare uuid detected with no cue word. The text says nothing about what it
 * names, so the host's reference resolver (`cfg.resolveEndpoint`, dash's
 * `POST /api/resolve`) is asked, and the chip re-renders as whichever kind the
 * id turns out to be: a session chip, a noteboard chip, or — for several
 * matches or a type with no dedicated chip — a generic chip whose panel lists
 * every match, because silently picking one would present a guess as a fact.
 * No resolver, no match, or a resolver error all render the id as plain text,
 * exactly what the message showed before detection existed (an error carries a
 * tooltip so the failure is discoverable without being noisy).
 */
function UuidChip({ refId }) {
    const cfg = useBridgeConfig();
    const configured = !!cfg.resolveEndpoint;
    const { data: matches, error } = useRefLoad(() => configured ? fetchResolvedRef(cfg.fetch, cfg.resolveEndpoint, refId) : Promise.reject(new Error('reference resolver not configured')));
    if (!matches || matches.length === 0) {
        return _jsx("span", { "data-ref-kind": "uuid", "data-ref-id": refId, title: error ?? undefined, children: refId });
    }
    if (matches.length === 1) {
        const match = matches[0];
        if (match.type === 'session')
            return _jsx(SessionChip, { refId: refId });
        if (match.type === 'note')
            return _jsx(NoteboardItemChip, { refId: refId });
    }
    return _jsx(MultiMatchChip, { refId: refId, matches: matches });
}
/** The honest rendering for an id that resolved ambiguously or to a type this
 *  renderer has no dedicated chip for: the panel lists every match and the
 *  reader does the picking. */
function MultiMatchChip({ refId, matches }) {
    const { open, setOpen, wrapRef } = useDropdown();
    const label = matches.length === 1 ? `${matches[0].type} ${idTail(refId, 12)}` : idTail(refId, 12);
    return (_jsxs("span", { className: "bc-ref-wrap", ref: wrapRef, children: [_jsxs("button", { type: "button", className: `bc-ref bc-ref-todo${open ? ' bc-ref-open' : ''}`, onClick: () => setOpen(o => !o), "aria-expanded": open, title: refId, children: [_jsx("span", { className: "bc-ref-glyph", "aria-hidden": true, children: "\uD83D\uDD17" }), _jsx("span", { className: "bc-ref-label", children: label }), _jsx("span", { className: "bc-ref-caret", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsxs("div", { className: "bc-ref-panel", role: "dialog", "aria-label": "Reference details", children: [_jsx("div", { className: "bc-ref-panel-title", children: refId }), matches.length > 1 && (_jsxs("div", { className: "bc-ref-panel-loading", children: ["This id resolves in ", matches.length, " stores:"] })), matches.map(m => (_jsx(RefRow, { label: m.type, value: m.service }, `${m.service}/${m.type}`)))] }))] }));
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
// Held and deleted outrank the item's type — a parked or deleted item is not
// work anyone should pick up, and that is what a reader most needs to know
// about a quoted id. Matches chat-core's itemEmoji.
function noteboardItemEmoji(item) {
    if (item.deleted_at)
        return '🗑';
    if (item.held_at)
        return '⏸';
    if (item.status === 'done')
        return '✅';
    if (item.type === 'note')
        return '📝';
    if (item.type === 'workspace')
        return '🧠';
    if (item.type === 'rank')
        return '🔢';
    return '☑';
}
//# sourceMappingURL=RefChip.js.map