import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNoteboardRefDetail, useResolvedRef, useSessionRefDetail, useSessionRefTranscript, REF_TRANSCRIPT_TURNS, } from '@kayushkin/chat-core';
import { SessionSignals } from './SessionSignals';
/**
 * A reference chip: a bare session id or a cue-prefixed noteboard uuid, found in
 * message text by `remarkRefChips` and rendered here as a labelled chip with a
 * detail panel.
 *
 * Wire it into ReactMarkdown as the `ref-chip` component alongside
 * `remarkRefChips`:
 *
 *   <ReactMarkdown
 *     remarkPlugins={[remarkRefChips]}
 *     components={{ 'ref-chip': RefChip }}
 *   >{text}</ReactMarkdown>
 *
 * ⚠️ This component reads from `ChatProvider`'s context (it resolves the id
 * against llm-bridge or noteboard), so it must be mounted inside one. It used to
 * be a pure `<span>` that could stand alone; it is not anymore.
 *
 * Theming still stays at the edge. Every element carries a stable, unhashed
 * class name (`ref-chip-*`) and `data-*` attributes, and this file ships no CSS
 * — the host styles it, as dash does in `Chat.module.css` via `:global()`.
 */
export function RefChip(props) {
    const kind = String(props.kind ?? 'session');
    const refId = String(props.refId ?? props.refid ?? '');
    // A malformed node with no id resolves to nothing; render the raw text rather
    // than an empty chip so the message loses no content.
    if (!refId)
        return _jsx(_Fragment, { children: String(props.children ?? '') });
    if (kind === 'session') {
        return (_jsx(SessionRefChip, { refId: refId, className: props.className, onActivate: props.onActivate }));
    }
    if (kind === 'uuid') {
        return (_jsx(UnclassifiedRefChip, { refId: refId, className: props.className, onActivate: props.onActivate }));
    }
    return _jsx(NoteboardRefChip, { refId: refId, kind: kind, className: props.className });
}
/** Gap in px between the chip and its panel, and the margin the panel keeps
 *  from the viewport edge when it has to be nudged back inside. */
const PANEL_GAP = 4;
const VIEWPORT_MARGIN = 8;
/**
 * Open/close plus placement for the detail panel.
 *
 * ⚠️ The panel is rendered through a PORTAL onto document.body, and that is
 * load-bearing rather than stylistic. dash renders turns through `virtua`,
 * whose list-item wrapper carries `contain: layout style` — which creates a
 * stacking context. A panel positioned inside that item therefore has its
 * `z-index` scoped to the item, and the very next turn's prose paints straight
 * over it: measured, the element at the panel's own centre point was a later
 * turn's `<p>`, so the buttons could be seen and not clicked. No z-index on the
 * panel can fix that from inside the containing block; escaping it can. The
 * portal also escapes the scroll container's `overflow`, which would otherwise
 * clip a panel opened on the last visible turn.
 *
 * The cost of the portal is that placement becomes manual: the panel is
 * `position: fixed` and anchored to the chip's measured rect, re-measured on
 * scroll and resize. `capture: true` on the scroll listener is required — the
 * turns list is an inner scroller and scroll events do not bubble to window.
 */
function useAnchoredPanel() {
    const [open, setOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState(null);
    const wrapRef = useRef(null);
    const panelRef = useRef(null);
    useLayoutEffect(() => {
        if (!open) {
            setPanelStyle(null);
            return;
        }
        const place = () => {
            const anchor = wrapRef.current;
            if (!anchor)
                return;
            const rect = anchor.getBoundingClientRect();
            // Measured when it exists; on the first pass it does not, and the fallback
            // only has to be close enough to avoid a visible jump.
            const panelHeight = panelRef.current?.offsetHeight ?? 260;
            const panelWidth = panelRef.current?.offsetWidth ?? 280;
            // Below the chip, unless that would run off the bottom and there is more
            // room above — the usual dropdown flip.
            const roomBelow = window.innerHeight - rect.bottom;
            const roomAbove = rect.top;
            const placeAbove = roomBelow < panelHeight + VIEWPORT_MARGIN && roomAbove > roomBelow;
            const rawTop = placeAbove ? rect.top - panelHeight - PANEL_GAP : rect.bottom + PANEL_GAP;
            const maxTop = window.innerHeight - panelHeight - VIEWPORT_MARGIN;
            const maxLeft = window.innerWidth - panelWidth - VIEWPORT_MARGIN;
            setPanelStyle({
                top: Math.max(VIEWPORT_MARGIN, Math.min(rawTop, Math.max(VIEWPORT_MARGIN, maxTop))),
                left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, Math.max(VIEWPORT_MARGIN, maxLeft))),
            });
        };
        place();
        // capture:true — the turns list scrolls internally and its scroll events
        // never reach window on the bubble phase.
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const onDocPointerDown = (e) => {
            const target = e.target;
            // The panel is no longer a descendant of the wrapper, so "outside" has to
            // clear BOTH or every click inside the panel would close it.
            const insideChip = wrapRef.current?.contains(target) ?? false;
            const insidePanel = panelRef.current?.contains(target) ?? false;
            if (!insideChip && !insidePanel)
                setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('mousedown', onDocPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    return { open, toggle: () => setOpen((o) => !o), wrapRef, panelRef, panelStyle };
}
/** The portaled panel shell. Kept in one place so both chips share the
 *  placement, the ref wiring and the dialog semantics. */
function AnchoredPanel({ panelRef, panelStyle, label, refId, refKind, children, }) {
    return createPortal(_jsx("div", { ref: panelRef, className: "ref-chip-panel", role: "dialog", "aria-label": label, "data-ref-id": refId, "data-ref-kind": refKind, 
        // Placement is inline because it is measured, not themeable. Everything
        // else about the panel's appearance stays in the host's stylesheet.
        // `visibility` hides the first, unmeasured paint rather than letting it
        // flash at the wrong place.
        style: {
            top: panelStyle?.top ?? 0,
            left: panelStyle?.left ?? 0,
            visibility: panelStyle ? 'visible' : 'hidden',
        }, children: children }), document.body);
}
function truncate(s, n = 28) {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
/** Last `n` characters of an id, for a chip whose target has no name yet. */
function idTail(id, n = 12) {
    return id.length > n ? `…${id.slice(-n)}` : id;
}
/** Relative time, for rows where "how long ago" is the question. Falls back to
 *  the raw string when the timestamp does not parse — never to "now", which
 *  would be a fabricated answer. */
function timeAgo(iso) {
    const then = Date.parse(iso);
    if (Number.isNaN(then))
        return iso;
    const seconds = Math.round((Date.now() - then) / 1000);
    const future = seconds < 0;
    const abs = Math.abs(seconds);
    const [value, unit] = abs < 60
        ? [abs, 'second']
        : abs < 3600
            ? [Math.round(abs / 60), 'minute']
            : abs < 86400
                ? [Math.round(abs / 3600), 'hour']
                : [Math.round(abs / 86400), 'day'];
    const plural = value === 1 ? '' : 's';
    return future ? `in ${value} ${unit}${plural}` : `${value} ${unit}${plural} ago`;
}
function formatUsd(usd) {
    return usd < 0.01 && usd > 0 ? `<$0.01` : `$${usd.toFixed(2)}`;
}
/**
 * The chip's emoji, categorizing a session the way the filter bar does: by
 * stored `type`, refined with `purpose` and the id prefix — herald and
 * autoworker are purposes of an autonomous session, not distinct types.
 * `external` means the session ran outside the bridge and was imported by
 * scanning harness history, so nobody declared a purpose and it must not read
 * as a human chat.
 */
function sessionEmoji(type, purpose, sessionId) {
    if (type === 'herald' || purpose === 'herald' || sessionId.startsWith('herald-'))
        return '📣';
    if (purpose === 'autoworker' || sessionId.startsWith('autoworker-'))
        return '🤖';
    if (type === 'interactive')
        return '💬';
    if (type === 'system')
        return '⚙️';
    if (type === 'autonomous')
        return '🛠️';
    if (type === 'external')
        return '📥';
    return '🔗';
}
/** The "needs a human" states, badged so a waiting question stands out. */
const STATE_BADGES = new Map([
    ['awaiting_user', 'question'],
    ['awaiting_permission', 'approval'],
]);
// ---------------------------------------------------------------------------
// Session chip
// ---------------------------------------------------------------------------
function SessionRefChip({ refId, className, onActivate, }) {
    const { open, toggle, wrapRef, panelRef, panelStyle } = useAnchoredPanel();
    const { data, error, loading } = useSessionRefDetail(refId);
    const summary = data?.summary;
    const emoji = summary ? sessionEmoji(summary.type, summary.purpose, refId) : '💬';
    const label = summary?.displayName ? truncate(summary.displayName) : idTail(refId);
    // The chip BODY opens the detail panel; navigation lives on the ↗ button beside
    // it. It used to be the other way around — body navigated, a separate ▾ caret
    // opened the panel — and the user asked for the inversion: a glance at what a
    // reference names is the common case, leaving the thread is the deliberate one.
    // The body therefore matches the noteboard chip's shape (one button, inline
    // caret), and the ↗ renders only when a navigation handler exists — same rule
    // as before, an affordance never points nowhere.
    return (_jsxs("span", { className: "ref-chip-wrap", ref: wrapRef, "data-ref-kind": "session", "data-ref-id": refId, children: [_jsxs("button", { type: "button", className: `${className ?? 'ref-chip ref-chip-session'} ref-chip-item${open ? ' ref-chip-open' : ''}`, onClick: toggle, "aria-expanded": open, title: summary?.displayName || refId, children: [_jsx("span", { className: "ref-chip-glyph", "aria-hidden": true, children: emoji }), _jsx("span", { className: "ref-chip-label", children: label }), _jsx("span", { className: "ref-chip-caret-inline", "aria-hidden": true, children: "\u25BE" })] }), onActivate && (_jsx("button", { type: "button", className: "ref-chip-open-session", onClick: () => onActivate('session', refId), "aria-label": `Open chat — ${summary?.displayName || refId}`, title: `Open chat — ${summary?.displayName || refId}`, children: "\u2197" })), open && (_jsxs(AnchoredPanel, { panelRef: panelRef, panelStyle: panelStyle, label: "Session details", refId: refId, refKind: "session", children: [loading && _jsx("div", { className: "ref-chip-panel-loading", children: "Loading session\u2026" }), error && _jsxs("div", { className: "ref-chip-panel-error", children: ["Couldn\u2019t load session: ", error] }), data && _jsx(SessionRefPanel, { detail: data, refId: refId, onActivate: onActivate })] }))] }));
}
function SessionRefPanel({ detail, refId, onActivate, }) {
    const [showHistory, setShowHistory] = useState(false);
    const { summary, info } = detail;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "ref-chip-panel-title", children: summary.displayName || '(untitled session)' }), _jsx(RefRow, { label: "State", value: summary.state, badge: STATE_BADGES.get(summary.state) }), _jsx(RefRow, { label: "Type", value: summary.purpose ? `${summary.type} · ${summary.purpose}` : summary.type }), summary.harness !== '' && _jsx(RefRow, { label: "Harness", value: summary.harness }), info?.model && _jsx(RefRow, { label: "Model", value: info.model }), info?.permissionMode && _jsx(RefRow, { label: "Permissions", value: info.permissionMode }), summary.mode !== '' && _jsx(RefRow, { label: "Mode", value: summary.mode }), summary.folderName !== '' && _jsx(RefRow, { label: "Folder", value: summary.folderName }), summary.instanceId !== '' && _jsx(RefRow, { label: "Instance", value: summary.instanceId }), (info?.workingDir ?? detail.workingDir) && (_jsx(RefRow, { label: "Working dir", value: (info?.workingDir ?? detail.workingDir) })), detail.origin && _jsx(RefRow, { label: "Origin", value: detail.origin }), detail.pid !== undefined && _jsx(RefRow, { label: "PID", value: String(detail.pid) }), detail.spendUsd !== undefined && (_jsx(RefRow, { label: "Spend", value: detail.maxBudgetUsd !== undefined
                    ? `${formatUsd(detail.spendUsd)} of ${formatUsd(detail.maxBudgetUsd)}`
                    : formatUsd(detail.spendUsd) })), detail.forkedFromSessionId && (_jsx(RefRow, { label: "Forked from", value: idTail(detail.forkedFromSessionId, 14) })), detail.managerSessionId && (_jsx(RefRow, { label: "Manager", value: idTail(detail.managerSessionId, 14) })), info?.tools && info.tools.length > 0 && (_jsx(RefRow, { label: "Tools", value: String(info.tools.length) })), info?.mcpServers && info.mcpServers.length > 0 && (_jsx(RefRow, { label: "MCP", value: info.mcpServers.map((s) => s.name).join(', ') })), info?.skills && info.skills.length > 0 && (_jsx(RefRow, { label: "Skills", value: info.skills.join(', ') })), _jsx(RefRow, { label: "Created", value: timeAgo(summary.createdAt) }), _jsx(RefRow, { label: "Updated", value: timeAgo(summary.updatedAt) }), _jsxs("div", { className: "ref-chip-panel-actions", children: [_jsx("button", { type: "button", className: "ref-chip-panel-btn", onClick: () => setShowHistory((v) => !v), "aria-expanded": showHistory, children: showHistory ? 'Hide history' : `Load last ${REF_TRANSCRIPT_TURNS} turns` }), onActivate && (_jsx("button", { type: "button", className: "ref-chip-panel-btn", onClick: () => onActivate('session', refId), children: "Open session" }))] }), _jsx(SessionSignals, { sessionId: detail.sessionId || refId, compact: true }), showHistory && _jsx(SessionRefTranscript, { refId: refId })] }));
}
function SessionRefTranscript({ refId }) {
    const { data, error, loading } = useSessionRefTranscript(refId, true);
    if (loading)
        return _jsx("div", { className: "ref-chip-panel-loading", children: "Loading history\u2026" });
    if (error)
        return _jsxs("div", { className: "ref-chip-panel-error", children: ["Couldn\u2019t load history: ", error] });
    if (!data)
        return _jsx("div", { className: "ref-chip-panel-loading", children: "No history." });
    return _jsx(TranscriptBody, { model: data });
}
/**
 * The referenced session's recent turns, as plain text.
 *
 * Deliberately NOT markdown: chat-core carries no markdown renderer (dash owns
 * that pipeline, with its own plugins), and reaching for one here would both add
 * a dependency this package refuses and risk recursion — a transcript rendered
 * through `remarkRefChips` would linkify the ids inside it into more chips, each
 * able to load another transcript.
 */
function TranscriptBody({ model }) {
    const rows = model.turns.map((turn) => {
        // The collapsed view's rule: primary, non-duplicate entries only, so an
        // OTel copy of a message does not print twice.
        const text = turn.entryIds
            .map((id) => model.entries[id])
            .filter((e) => e !== undefined)
            .filter((e) => !e.duplicate && e.primary && e.kind === 'text' && e.text)
            .map((e) => e.text)
            .join('\n');
        return { id: turn.id, role: turn.role, ts: turn.ts, text };
    });
    const withText = rows.filter((r) => r.text !== '');
    return (_jsxs("div", { className: "ref-chip-transcript", children: [model.more && (_jsxs("div", { className: "ref-chip-transcript-note", children: ["Showing the last ", REF_TRANSCRIPT_TURNS, " turns \u2014 older ones exist. Open the session for the rest."] })), withText.length === 0 && (_jsx("div", { className: "ref-chip-panel-loading", children: "No prose turns in this window." })), withText.map((r) => (_jsxs("div", { className: "ref-chip-transcript-turn", "data-role": r.role, children: [_jsxs("div", { className: "ref-chip-transcript-role", children: [r.role, " \u00B7 ", timeAgo(r.ts)] }), _jsx("div", { className: "ref-chip-transcript-text", children: r.text })] }, r.id)))] }));
}
// ---------------------------------------------------------------------------
// Noteboard chip (note / todo / rank / workspace)
// ---------------------------------------------------------------------------
/** Emoji for a noteboard item. Held and deleted outrank the item's type,
 *  because they are what a reader most needs to know about a quoted id: a
 *  parked or deleted item is not work anyone should pick up. */
function itemEmoji(item) {
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
function NoteboardRefChip({ refId, kind, className, }) {
    const { open, toggle, wrapRef, panelRef, panelStyle } = useAnchoredPanel();
    const { data: item, error, loading } = useNoteboardRefDetail(refId);
    // The cue word only decided which regex matched; the loaded item's own `type`
    // is the authority, so the rendered kind switches to it as soon as it lands.
    const resolvedKind = item?.type ?? kind;
    const label = item?.title ? truncate(item.title) : idTail(refId);
    const emoji = item ? itemEmoji(item) : '☑';
    return (_jsxs("span", { className: "ref-chip-wrap", ref: wrapRef, "data-ref-kind": resolvedKind, "data-ref-id": refId, children: [_jsxs("button", { type: "button", className: `${className ?? 'ref-chip'} ref-chip-item${open ? ' ref-chip-open' : ''}`, onClick: toggle, "aria-expanded": open, title: `${resolvedKind} — ${item?.title || refId}`, children: [_jsx("span", { className: "ref-chip-glyph", "aria-hidden": true, children: emoji }), _jsx("span", { className: "ref-chip-label", children: label }), _jsx("span", { className: "ref-chip-caret-inline", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsxs(AnchoredPanel, { panelRef: panelRef, panelStyle: panelStyle, label: `${resolvedKind} details`, refId: refId, refKind: resolvedKind, children: [loading && _jsxs("div", { className: "ref-chip-panel-loading", children: ["Loading ", kind, "\u2026"] }), error && _jsxs("div", { className: "ref-chip-panel-error", children: ["Couldn\u2019t load ", kind, ": ", error] }), item && _jsx(NoteboardRefPanel, { item: item })] }))] }));
}
function NoteboardRefPanel({ item }) {
    const [showBody, setShowBody] = useState(false);
    // Deleted and held are not statuses (noteboard keeps them as separate stamps
    // precisely so a restore can tell them apart), so they are badged onto the
    // status row rather than replacing its value.
    const statusBadge = item.deleted_at ? 'deleted' : item.held_at ? 'held' : undefined;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "ref-chip-panel-title", children: item.title || '(untitled)' }), _jsx(RefRow, { label: "Type", value: item.type }), _jsx(RefRow, { label: "Status", value: item.status, badge: statusBadge }), item.priority !== 0 && _jsx(RefRow, { label: "Priority", value: String(item.priority) }), item.tags.length > 0 && _jsx(RefRow, { label: "Tags", value: item.tags.join(', ') }), item.list_id !== '' && _jsx(RefRow, { label: "List", value: item.list_id }), item.parent_id && _jsx(RefRow, { label: "Parent", value: idTail(item.parent_id, 12) }), item.due_at && _jsx(RefRow, { label: "Due", value: timeAgo(item.due_at) }), item.schedule?.rrule && (_jsx(RefRow, { label: "Repeats", value: item.schedule.tzid
                    ? `${item.schedule.rrule} (${item.schedule.tzid})`
                    : item.schedule.rrule })), item.schedule?.remind?.nag && _jsx(RefRow, { label: "Nags", value: item.schedule.remind.nag }), item.hold_reason && _jsx(RefRow, { label: "Held because", value: item.hold_reason }), item.auto_hold_at_usd !== undefined && (_jsx(RefRow, { label: "Spend ceiling", value: formatUsd(item.auto_hold_at_usd) })), item.links.length > 0 && _jsx(RefRow, { label: "Links", value: String(item.links.length) }), item.created_by !== '' && _jsx(RefRow, { label: "Created by", value: item.created_by }), _jsx(RefRow, { label: "Created", value: timeAgo(item.created_at) }), _jsx(RefRow, { label: "Updated", value: timeAgo(item.updated_at) }), item.body !== '' && (_jsxs(_Fragment, { children: [_jsx("div", { className: "ref-chip-panel-actions", children: _jsx("button", { type: "button", className: "ref-chip-panel-btn", onClick: () => setShowBody((v) => !v), "aria-expanded": showBody, children: showBody ? 'Hide body' : 'Show full body' }) }), showBody && _jsx("div", { className: "ref-chip-item-body", children: item.body })] }))] }));
}
// ---------------------------------------------------------------------------
// Unclassified chip (a bare uuid, classified through the host's resolver)
// ---------------------------------------------------------------------------
/**
 * A bare uuid detected with no cue word. The surrounding text says nothing
 * about what it names, so the host's reference resolver is asked, and the chip
 * re-renders as whichever kind the id turns out to be:
 *
 *  - one `session` match → the session chip;
 *  - one `note` match (noteboard's one id space — note, todo, rank,
 *    workspace) → the noteboard chip, which labels itself from the item;
 *  - several matches, or a type this renderer has no chip for → a generic chip
 *    whose panel lists every match, because picking one silently would be a
 *    guess presented as a fact;
 *  - no match, no resolver, or a resolver error → the id as plain text, which
 *    is exactly what the message showed before detection existed. An error
 *    carries a tooltip so the failure is discoverable without being noisy.
 */
function UnclassifiedRefChip({ refId, className, onActivate, }) {
    const { data: matches, error, loading } = useResolvedRef(refId);
    if (loading || matches === null || matches.length === 0) {
        return (_jsx("span", { "data-ref-kind": "uuid", "data-ref-id": refId, title: error ?? undefined, children: refId }));
    }
    if (matches.length === 1) {
        const match = matches[0];
        if (match.type === 'session') {
            return _jsx(SessionRefChip, { refId: refId, className: className, onActivate: onActivate });
        }
        if (match.type === 'note') {
            // The fetched item's own `type` labels the chip; the match's registry
            // type only says which store answered.
            const itemType = match.data?.type ?? 'note';
            return _jsx(NoteboardRefChip, { refId: refId, kind: itemType, className: className });
        }
    }
    return _jsx(MultiMatchRefChip, { refId: refId, matches: matches, className: className });
}
/** The honest rendering for an id that resolved ambiguously (several stores
 *  recognize it) or to a type this renderer has no dedicated chip for: a chip
 *  whose panel lists every match, so the reader does the picking. */
function MultiMatchRefChip({ refId, matches, className, }) {
    const { open, toggle, wrapRef, panelRef, panelStyle } = useAnchoredPanel();
    const label = matches.length === 1 ? `${matches[0]?.type} ${idTail(refId)}` : idTail(refId);
    return (_jsxs("span", { className: "ref-chip-wrap", ref: wrapRef, "data-ref-kind": "resolved", "data-ref-id": refId, children: [_jsxs("button", { type: "button", className: `${className ?? 'ref-chip'} ref-chip-item${open ? ' ref-chip-open' : ''}`, onClick: toggle, "aria-expanded": open, title: refId, children: [_jsx("span", { className: "ref-chip-glyph", "aria-hidden": true, children: "\uD83D\uDD17" }), _jsx("span", { className: "ref-chip-label", children: label }), _jsx("span", { className: "ref-chip-caret-inline", "aria-hidden": true, children: "\u25BE" })] }), open && (_jsxs(AnchoredPanel, { panelRef: panelRef, panelStyle: panelStyle, label: "Reference details", refId: refId, refKind: "resolved", children: [_jsx("div", { className: "ref-chip-panel-title", children: refId }), matches.length > 1 && (_jsxs("div", { className: "ref-chip-panel-loading", children: ["This id resolves in ", matches.length, " stores:"] })), matches.map((m) => (_jsx(RefRow, { label: m.type, value: m.service }, `${m.service}/${m.type}`)))] }))] }));
}
// ---------------------------------------------------------------------------
function RefRow({ label, value, badge, }) {
    return (_jsxs("div", { className: "ref-chip-panel-row", children: [_jsx("span", { className: "ref-chip-panel-label", children: label }), _jsxs("span", { className: "ref-chip-panel-value", children: [value, badge && _jsx("span", { className: `ref-chip-badge ref-chip-badge-${badge}`, children: badge })] })] }));
}
//# sourceMappingURL=RefChip.js.map