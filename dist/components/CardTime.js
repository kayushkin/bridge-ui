import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../context';
import { formatDurationCompact, formatDurationProse } from '../utils';
/**
 * A card's clock, as a badge.
 *
 * It answers the question a board is actually asked — is this late? — which
 * needs two numbers, not one. A card that arrived yesterday and spent all of it
 * waiting on somebody else's reply has burned none of its limit; a card opened
 * an hour ago and worked the whole hour has burned half a two-hour one. Reporting
 * age alone cannot tell those apart, so the badge leads with the budget clock and
 * keeps elapsed in the tooltip.
 *
 * A card with no limit still gets the badge, showing what it has spent with
 * nothing to spend it against. A card nothing has happened to yet gets none at
 * all: the caller falls back to the activity badge, which is the honest answer
 * for a card whose history predates the event log.
 */
export function CardBudgetBadge({ time }) {
    if (!hasClockData(time))
        return null;
    const spent = formatDurationCompact(time.budget_clock_seconds);
    const limit = formatDurationCompact(time.budget_seconds);
    if (!spent)
        return null;
    const over = time.over_budget === true;
    const nearly = !over && time.budget_seconds !== undefined
        && time.budget_clock_seconds >= time.budget_seconds * 0.75;
    const classes = ['bk-card-budget'];
    if (over)
        classes.push('bk-card-budget-over');
    else if (nearly)
        classes.push('bk-card-budget-close');
    if (time.clock_state === 'paused')
        classes.push('bk-card-budget-paused');
    if (time.clock_state === 'stopped')
        classes.push('bk-card-budget-stopped');
    return (_jsxs("span", { className: classes.join(' '), title: describeCardTime(time), children: [time.priority_label && _jsx("b", { className: "bk-card-budget-rung", children: time.priority_label }), _jsxs("span", { className: "bk-card-budget-clock", children: [clockStateMark(time.clock_state), " ", spent] }), limit && _jsxs("span", { className: "bk-card-budget-limit", children: ["/ ", limit] })] }));
}
/** Whether a card has anything to say about its clock. Cards whose whole history
 * predates the event log have no events and no rung, and asking them for a
 * budget badge would draw a zero that means "we never saw it", not "no time has
 * been spent". */
export function hasClockData(time) {
    if (!time)
        return false;
    return time.event_count > 0 || time.budget_seconds !== undefined;
}
/** The mark says which clock is running, because the same number means different
 * things when it is still counting and when it has stopped. */
function clockStateMark(state) {
    if (state === 'paused')
        return '⏸';
    if (state === 'stopped')
        return '✓';
    return '▶';
}
/** The tooltip carries every figure the badge had to leave out, including the
 * working-week ones when the board declares hours. */
export function describeCardTime(time) {
    const lines = [];
    if (time.priority_label && time.budget_seconds !== undefined) {
        lines.push(`${time.priority_label}: ${formatDurationProse(time.budget_seconds)} allowed`);
    }
    else if (time.priority_label) {
        lines.push(`${time.priority_label}: no time limit set`);
    }
    lines.push(`Worked: ${formatDurationProse(time.budget_clock_seconds)}`);
    lines.push(`Waiting on someone else: ${formatDurationProse(time.waiting_seconds)}`);
    lines.push(`Elapsed in total: ${formatDurationProse(time.elapsed_seconds)}`);
    if (time.business_hours_elapsed_seconds !== undefined) {
        lines.push(`Within business hours — worked ${formatDurationProse(time.business_hours_budget_clock_seconds)}, elapsed ${formatDurationProse(time.business_hours_elapsed_seconds)}`);
    }
    if (time.over_budget === true && time.budget_remaining_seconds !== undefined) {
        lines.push(`Over by ${formatDurationProse(Math.abs(time.budget_remaining_seconds))}`);
    }
    else if (time.budget_remaining_seconds !== undefined) {
        lines.push(`${formatDurationProse(time.budget_remaining_seconds)} left`);
    }
    lines.push(time.clock_state === 'paused'
        ? 'The clock is paused: the ball is with someone else.'
        : time.clock_state === 'stopped'
            ? 'Finished — the clock has stopped.'
            : 'The clock is running.');
    return lines.join('\n');
}
/**
 * The card's history: what happened, in what order, and how long each step took.
 *
 * Every figure on screen is computed by kanban-store from the same event log
 * this list renders, so a reader can check the totals against the steps rather
 * than taking them on trust.
 */
export function CardTimelinePanel({ cardID, boardID }) {
    const { fetch: fetchFn, kanbanStoreBasePath } = useBridgeConfig();
    const [timeline, setTimeline] = useState(null);
    const [error, setError] = useState(null);
    const [noteBody, setNoteBody] = useState('');
    const [handingOver, setHandingOver] = useState(false);
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        if (!kanbanStoreBasePath)
            return;
        const query = boardID ? `?board_id=${encodeURIComponent(boardID)}` : '';
        try {
            const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/timeline${query}`);
            if (!res.ok)
                throw new Error(`timeline: ${res.status}`);
            setTimeline(await res.json());
            setError(null);
        }
        catch (e) {
            // A timeline that failed to load says so. Rendering an empty history
            // instead would read as "nothing has happened to this card", which is a
            // different and much more reassuring claim than "we could not find out".
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [cardID, boardID, fetchFn, kanbanStoreBasePath]);
    useEffect(() => { void load(); }, [load]);
    const addNote = async () => {
        if (!noteBody.trim() || !kanbanStoreBasePath)
            return;
        setSaving(true);
        try {
            const res = await fetchFn(`${kanbanStoreBasePath}/api/cards/${encodeURIComponent(cardID)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    body: noteBody,
                    board_id: boardID ?? '',
                    // A note that hands the ball over is the moment the clock pauses, which
                    // is how "replied, waiting on them" is one action rather than two.
                    clock_state: handingOver ? 'paused' : undefined,
                }),
            });
            if (!res.ok)
                throw new Error(`add note: ${res.status}`);
            setNoteBody('');
            setHandingOver(false);
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    };
    if (error)
        return _jsxs("div", { className: "bridge-error", children: ["Could not read this card's history: ", error] });
    if (!timeline)
        return _jsx("div", { className: "bi-empty", children: "Reading this card's history\u2026" });
    return (_jsxs("div", { className: "bk-timeline", children: [_jsx(CardTimeTotals, { time: timeline.summary }), _jsxs("div", { className: "bk-timeline-compose", children: [_jsx("textarea", { rows: 2, value: noteBody, placeholder: "What happened? A status update or a summary \u2014 it lands on the timeline.", onChange: e => setNoteBody(e.target.value) }), _jsxs("div", { className: "bk-timeline-compose-actions", children: [_jsxs("label", { title: "Record this note as the moment the work stopped being yours to do. The clock pauses until something starts it again.", children: [_jsx("input", { type: "checkbox", checked: handingOver, onChange: e => setHandingOver(e.target.checked) }), "Waiting on someone else after this"] }), _jsx("button", { type: "button", className: "bi-add-btn", disabled: !noteBody.trim() || saving, onClick: addNote, children: "Add note" })] })] }), timeline.entries.length === 0 ? (_jsx("div", { className: "bi-empty", children: "Nothing recorded yet. Cards carry a history from the moment something happens to them \u2014 mail arriving, an agent picking it up, a move, a note." })) : (_jsx("ol", { className: "bk-timeline-list", children: timeline.entries.map(entry => _jsx(TimelineRow, { entry: entry }, entry.event.id)) }))] }));
}
/** The three numbers, side by side, with the working-week pair alongside them
 * when the board declares hours. */
function CardTimeTotals({ time }) {
    const hasBusinessHours = time.business_hours_elapsed_seconds !== undefined;
    return (_jsxs("div", { className: "bk-timeline-totals", children: [_jsx(Figure, { label: "Worked", value: formatDurationCompact(time.budget_clock_seconds), business: hasBusinessHours ? formatDurationCompact(time.business_hours_budget_clock_seconds) : null, hint: "Time the work was actually available to be done. This is what the limit is measured against.", emphasis: time.over_budget === true ? 'over' : undefined }), _jsx(Figure, { label: "Waiting", value: formatDurationCompact(time.waiting_seconds), business: null, hint: "Time the ball was with someone else. It does not count against the limit." }), _jsx(Figure, { label: "Elapsed", value: formatDurationCompact(time.elapsed_seconds), business: hasBusinessHours ? formatDurationCompact(time.business_hours_elapsed_seconds) : null, hint: "Wall clock, from the first thing that happened to the last." }), _jsx(Figure, { label: time.priority_label ? `${time.priority_label} limit` : 'Limit', value: formatDurationCompact(time.budget_seconds) ?? 'none', business: null, hint: time.budget_seconds === undefined
                    ? 'This card carries no limit — either its board ignores priorities, or nobody has ranked it.'
                    : 'The time work at this priority is meant to take.' })] }));
}
/** One figure, with its business-hours counterpart underneath rather than
 * instead of it — the working week is an extra way of reading the same stretch
 * of time, not a replacement for the wall clock. */
function Figure({ label, value, business, hint, emphasis, }) {
    return (_jsxs("div", { className: `bk-timeline-figure${emphasis === 'over' ? ' bk-timeline-figure-over' : ''}`, title: hint, children: [_jsx("span", { className: "bk-timeline-figure-label", children: label }), _jsx("span", { className: "bk-timeline-figure-value", children: value ?? '—' }), business !== null && (_jsxs("span", { className: "bk-timeline-figure-business", title: "Counting only the board's business hours", children: [business, " in hours"] }))] }));
}
function TimelineRow({ entry }) {
    const gap = formatDurationCompact(entry.seconds_since_previous_event);
    const held = formatDurationCompact(entry.segment_seconds);
    const when = new Date(entry.event.occurred_at);
    return (_jsxs("li", { className: `bk-timeline-entry bk-timeline-${entry.clock_state}`, children: [gap && entry.seconds_since_previous_event > 0 && (_jsxs("div", { className: "bk-timeline-gap", children: ["\u2193 ", gap, " later"] })), _jsxs("div", { className: "bk-timeline-head", children: [_jsx("span", { className: "bk-timeline-kind", children: describeEventKind(entry.event.kind) }), _jsx("span", { className: "bk-timeline-when", title: when.toLocaleString(), children: when.toLocaleString() }), entry.event.actor && _jsx("span", { className: "bk-timeline-actor", children: entry.event.actor })] }), entry.event.summary && _jsx("div", { className: "bk-timeline-summary", children: entry.event.summary }), entry.note && _jsx(NoteBody, { note: entry.note }), held && entry.segment_seconds > 0 && (_jsxs("div", { className: "bk-timeline-segment", children: [entry.counts_against_budget ? 'counted' : entry.clock_state === 'paused' ? 'waiting' : 'after this', ' ', held, entry.segment_open ? ' and running' : ''] }))] }));
}
function NoteBody({ note }) {
    return (_jsxs("div", { className: "bk-timeline-note", children: [note.kind !== 'note' && _jsx("span", { className: "bk-tag", children: note.kind }), note.body] }));
}
/** Event kinds are stored as they were recorded, including kinds this UI has
 * never heard of. An unknown one reads as its own name with the underscores
 * taken out rather than being dropped or labelled "unknown" — the log is the
 * record, and a reader is better served by the raw kind than by nothing. */
const EVENT_KIND_LABELS = {
    card_created: 'Card created',
    card_attached: 'Added to the board',
    card_detached: 'Taken off the board',
    card_moved: 'Moved',
    card_held: 'Held',
    card_unheld: 'Released',
    card_completed: 'Completed',
    email_received: 'Email arrived',
    agent_dispatched: 'Handed to an agent',
    agent_finished: 'Agent finished',
    note_added: 'Note',
    waiting_started: 'Waiting on someone else',
    waiting_ended: 'Ball back with us',
};
export function describeEventKind(kind) {
    return EVENT_KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}
//# sourceMappingURL=CardTime.js.map