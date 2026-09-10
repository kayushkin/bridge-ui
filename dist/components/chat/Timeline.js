import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useMemo, useRef } from 'react';
import { VList } from 'virtua';
import { useTurns, selectTimeline, useLiveStatus } from '@kayushkin/chat-core';
import { RefChip } from './RefChip';
import { formatHMS } from './bridgeAdapters';
import { useSelectSession } from './useSelectSession';
import { SubagentsChip } from './SessionStatusLine';
import styles from './Chat.module.css';
/** The Timeline pane — a third view alongside Turns/Raw. Presentation-only: it
 *  consumes `selectTimeline(model)`'s flat, chronological rows and renders them
 *  in bridge-ui's timeline DOM (bc-timeline / bc-timeline-body / bc-tl-item /
 *  bc-tl-<tone>) so it inherits the shared stylesheet. It never decides what a
 *  row is (chat-core owns the derivation, memoized on model identity).
 *
 *  It shows what THIS session did, and nothing a subagent did. A subagent's work
 *  is a session of its own, so a task contributes a spawn row and a finish row,
 *  each carrying a chip that opens the subagent's session — the same chip a
 *  session reference in the chat gets. The pane used to nest a subagent's rows
 *  under a task header instead, which is where the reported bug lived: with more
 *  than one subagent running, rows landed under the wrong header and then fell
 *  out from under it as soon as any task finished.
 *
 *  We feed selectTimeline a TurnModel assembled from useTurns' already-materialized
 *  `entries` (the whole entry dict — selectTimeline reads only `model.entries`,
 *  ordered by eventId). The wrapper object is memoized on `entries` identity so the
 *  selector's identity-memo stays warm across unrelated re-renders. */
export default function Timeline({ sessionId, style }) {
    // 'raw' guarantees the full entry dict is loaded/tailed; the entries record is the
    // same either way, but this keeps intent explicit (Timeline is the audit surface).
    const { turns, entries, loading, more, loadOlder } = useTurns(sessionId, 'raw');
    // Clicking a subagent chip switches the pane to that session, the same as
    // clicking a session reference in the chat.
    //
    // Held through a ref so this callback's identity NEVER changes. useSelectSession
    // rebuilds on every change to the session list (it reads `groups` to resolve the
    // instance id), and the list churns constantly on a live dashboard. Passed
    // straight down, that invalidated the memo on every TimelineTurn on every poll,
    // so every turn group re-rendered and virtua re-measured the entire list —
    // which it does against absolutely-positioned items, so the visible symptom was
    // rows drawn over each other at stale offsets.
    const select = useSelectSession();
    const selectRef = useRef(select);
    selectRef.current = select;
    const onActivateSubagent = useCallback((_kind, refId) => {
        selectRef.current(refId);
    }, []);
    // Same ref, same reason: handed to a leaf that must not re-render on every
    // change to the session list.
    const onActivateSubagentSession = useCallback((refId) => {
        selectRef.current(refId);
    }, []);
    // Applied to every `bc-timeline` root below — the main render and three early
    // returns. One object for the reason `TurnList`'s copy states: the resizer finds
    // this pane by `[data-pane="timeline"]`, and an attribute on the loaded root alone
    // would leave the boundary dead while the pane is still empty.
    const rootProps = { className: 'bc-timeline', style, 'data-pane': 'timeline' };
    const model = useMemo(() => {
        if (!sessionId)
            return undefined;
        return {
            sessionId,
            turns,
            entries,
            validator: { maxEventId: 0, eventCount: 0, updatedAt: '' },
            more,
        };
    }, [sessionId, turns, entries, more]);
    const timeline = selectTimeline(model);
    // One list child per ROW, not per turn.
    //
    // A turn used to be one child holding all of its rows, and on a long session
    // that child is tens of thousands of pixels tall. virtua sizes a child it has
    // not yet mounted by estimate and corrects when it measures — measured here,
    // scrollHeight swung 78,860 → 92,388 → 84,919 → 55,713 during a single scroll,
    // and a scroll target moved backwards mid-sequence. Rows are near-uniform, so
    // the same correction is worth pixels.
    const rows = useMemo(() => {
        const out = [];
        for (const group of timeline.turns) {
            out.push(_jsx(TimelineItemRow, { item: group.header, isTurnHeader: true, onActivateSubagent: onActivateSubagent }, group.header.key));
            for (const item of group.children) {
                out.push(_jsx(TimelineItemRow, { item: item, onActivateSubagent: onActivateSubagent }, item.key));
            }
        }
        return out;
    }, [timeline.turns, onActivateSubagent]);
    if (!sessionId) {
        return (_jsx("div", { ...rootProps, children: _jsx("div", { className: "bc-timeline-body", children: _jsx("div", { className: "bc-timeline-empty", children: "Select a session to see its timeline." }) }) }));
    }
    if (loading && timeline.count === 0) {
        return (_jsx("div", { ...rootProps, children: _jsx("div", { className: "bc-timeline-body", children: _jsx("div", { className: "bc-timeline-empty", children: "Loading\u2026" }) }) }));
    }
    if (timeline.count === 0) {
        return (_jsx("div", { ...rootProps, children: _jsx("div", { className: "bc-timeline-body", children: _jsx("div", { className: "bc-timeline-empty", children: "No events yet" }) }) }));
    }
    return (_jsxs("div", { ...rootProps, children: [_jsxs(VList, { className: "bc-timeline-body", children: [more ? (_jsx("button", { className: styles.loadOlder, onClick: loadOlder, children: "\u2191 Load older events" }, "__older__")) : null, rows] }), _jsx(TimelineSubagents, { sessionId: sessionId, onOpenSession: onActivateSubagentSession })] }));
}
/**
 * The subscription for the chip above, deliberately its own component.
 *
 * `useLiveStatus` reads the turn model, the activity map AND `s.sessions`, so it
 * re-renders its caller on every sidebar poll. Called in `Timeline` itself that
 * would re-run the row derivation and hand virtua a new element array on every
 * poll, which it measures against absolutely-positioned items — the same failure
 * the `selectRef` dance above exists to prevent. As a leaf, the poll re-renders
 * one chip and nothing else.
 */
function TimelineSubagents({ sessionId, onOpenSession, }) {
    const live = useLiveStatus(sessionId);
    return _jsx(SubagentsChip, { subagents: live.subagents, onOpenSession: onOpenSession });
}
const TimelineItemRow = memo(function TimelineItemRow({ item, isTurnHeader, onActivateSubagent, }) {
    const rowClass = isTurnHeader ? 'bc-tl-row-turn-header' : 'bc-tl-row-in-turn';
    return (_jsxs("div", { className: `bc-tl-item bc-tl-row ${rowClass} bc-tl-${item.tone}`, title: item.fullText || item.detail || item.label, children: [_jsx("span", { className: "bc-tl-ts", children: formatHMS(item.ts) }), _jsx("span", { className: "bc-tl-icon", children: item.icon }), _jsx("span", { className: "bc-tl-label", children: item.label }), item.subagentType && _jsx("span", { className: "bc-tl-role", children: item.subagentType }), item.detail && _jsx("span", { className: "bc-tl-detail", children: item.detail }), item.subagentSessionId && (_jsx(RefChip, { kind: "session", refId: item.subagentSessionId, className: styles.refChip, onActivate: onActivateSubagent }))] }));
});
//# sourceMappingURL=Timeline.js.map