import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useConnState, useLiveStatus, } from '@kayushkin/chat-core';
import { formatHMS } from './bridgeAdapters';
import styles from './Chat.module.css';
/**
 * Decide the slot's current content. Priority: an action failure outranks
 * everything (the user just clicked something that refused); a dead stream
 * outranks session facts (nothing below it can be trusted live); stopped/paused
 * outrank compacting/live because they are mutually exclusive with a running
 * turn; live activity keeps the chat-core rule — never gated on session state
 * alone, a non-idle activity is itself evidence of work.
 */
export function useSessionStatus(sessionId, streaming, compacting, composerStatus) {
    const live = useLiveStatus(sessionId);
    const connState = useConnState();
    if (composerStatus.error) {
        const prefix = composerStatus.failedAction === 'stop'
            ? "couldn't stop — still running: "
            : composerStatus.failedAction === 'resume'
                ? "couldn't resume — still stopped: "
                : '';
        return { kind: 'error', text: `${prefix}${composerStatus.error}` };
    }
    // 'open' is the only state in which updates are actually flowing (the Composer's
    // own send gate uses the same test).
    if (connState !== 'open') {
        return {
            kind: 'disconnected',
            text: connState === 'closed'
                ? 'disconnected — nothing can be sent'
                : 'connecting — nothing can be sent yet',
        };
    }
    if (composerStatus.resumable)
        return { kind: 'stopped' };
    if (composerStatus.paused)
        return { kind: 'paused' };
    if (compacting)
        return { kind: 'compacting' };
    if (streaming || live.activity.kind !== 'idle')
        return { kind: 'live', live };
    return null;
}
/** Compact elapsed readout since an RFC3339 timestamp: `42s`, `3m 07s`, `1h 12m`. */
function formatElapsed(sinceTs, nowMs) {
    const startedMs = Date.parse(sinceTs);
    if (Number.isNaN(startedMs))
        return '';
    const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0)
        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0)
        return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
}
/** The live row's text: the newest in-flight call when the model has one (name +
 *  input summary, with a count when calls run in parallel), else the activity word.
 *  "responding" rather than chat-core's "streaming" — the reader is a person
 *  watching a chat, not the SSE plumbing. */
function mainActivityText(live) {
    const newest = live.toolCalls[live.toolCalls.length - 1];
    if (newest) {
        const name = newest.name || 'tool';
        const extra = live.toolCalls.length > 1 ? `  (+${live.toolCalls.length - 1} more)` : '';
        return `${name}${newest.summary ? ` — ${newest.summary}` : ''}${extra}`;
    }
    switch (live.activity.kind) {
        case 'thinking':
            return 'thinking';
        case 'streaming':
            return 'responding';
        case 'tool':
            // The activity names a tool but the model has no pairable in-flight entry
            // (an OTel-derived stand-in, or the entry not folded yet) — the name is
            // still the truest thing on hand.
            return live.activity.name || 'tool';
        default:
            // Busy per the server state, nothing heard on the stream yet.
            return 'working';
    }
}
/** What kind of worker a task row is: the agent role when reported, else an honest
 *  generic — a backgrounded shell is not an agent and must not read as one. */
function subagentKindLabel(task) {
    if (task.subagentType)
        return task.subagentType;
    return task.taskType === 'local_bash' ? 'background shell' : 'subagent';
}
/**
 * The `⑂ N agents` chip and the popover behind it: one row per running subagent,
 * with its kind, description, last tool, elapsed, and a link to its own promoted
 * session.
 *
 * Extracted from the status line because the status line is mounted inside the
 * TURNS pane alone (`TurnList.tsx`), so hiding that pane took the only view of a
 * session's running subagents with it. The Timeline pane mounts this too.
 *
 * ⚠️ Pure — it takes the subagents rather than subscribing for them. `useLiveStatus`
 * subscribes to `s.sessions` as well as the turn model, so a component that calls it
 * re-renders on every sidebar poll; keeping that subscription in a thin leaf beside
 * this chip is what stops a whole pane from doing so.
 */
export function SubagentsChip({ subagents, onOpenSession, }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    // The clock ticks only while the popover is OPEN, not merely while the turn is
    // live. The elapsed readouts it drives are inside the popover and are the only
    // thing on screen that changes per second; a closed popover re-rendering once a
    // second is a whole component tree's worth of work to update nothing visible.
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        if (!open)
            return;
        setNowMs(Date.now());
        const timer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const onMouseDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target))
                setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);
    // A popover left open for a fleet that has since finished would show stale rows.
    const count = subagents.length;
    useEffect(() => {
        if (count === 0)
            setOpen(false);
    }, [count]);
    if (count === 0)
        return null;
    return (_jsxs("div", { ref: rootRef, className: styles.subagentsAnchor, children: [_jsxs("button", { className: styles.statusAgentsChip, onClick: () => setOpen((v) => !v), "aria-expanded": open, title: "Running subagents", children: ["\u2442 ", count, " ", count === 1 ? 'agent' : 'agents'] }), open && (_jsx("div", { className: styles.statusPopover, children: subagents.map((task) => (_jsxs("div", { className: styles.statusAgentRow, children: [_jsx("span", { className: styles.statusAgentKind, children: subagentKindLabel(task) }), task.description && (_jsxs("span", { className: styles.statusText, title: task.description, children: ["\u2014 ", task.description] })), task.lastToolName && (_jsxs("span", { className: styles.statusAgentTool, children: ["\u00B7 ", task.lastToolName] })), _jsxs("span", { className: styles.statusTime, children: [formatHMS(task.startedAt), " \u00B7 ", formatElapsed(task.startedAt, nowMs)] }), task.sessionId && (_jsx("button", { className: styles.statusOpen, onClick: () => onOpenSession(task.sessionId), title: `Open subagent session ${task.sessionId}`, children: "open \u2197" }))] }, task.taskId))) }))] }));
}
export default function SessionStatusLine({ status, onOpenSession }) {
    // One shared 1s clock for the elapsed readouts, ticking only while the live row
    // is what's shown — no other kind renders a clock.
    const isLive = status.kind === 'live';
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        if (!isLive)
            return;
        setNowMs(Date.now());
        const timer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [isLive]);
    // The subagent chip and its popover own their own open state and clock now;
    // see SubagentsChip above, which the Timeline pane mounts as well.
    return (_jsxs("div", { className: styles.statusSlot, role: "status", "aria-live": "polite", children: [status.kind === 'error' && (_jsxs("span", { className: `${styles.statusText} ${styles.statusError}`, title: status.text, children: ["\u2717 ", status.text] })), status.kind === 'disconnected' && (_jsx("span", { className: `${styles.statusText} ${styles.statusWarn}`, children: status.text })), status.kind === 'stopped' && (_jsx("span", { className: styles.statusText, children: "\u23F8 stopped \u2014 its harness process is gone" })), status.kind === 'paused' && _jsx("span", { className: styles.statusText, children: "\u23F8 paused" }), status.kind === 'compacting' && (_jsxs(_Fragment, { children: [_jsx("span", { className: `${styles.statusPulse} ${styles.statusPulseViolet}`, "aria-hidden": true }), _jsx("span", { className: styles.statusCompacting, children: "Compacting context\u2026" })] })), status.kind === 'live' && (_jsxs(_Fragment, { children: [_jsx("span", { className: styles.statusPulse, "aria-hidden": true }), status.live.todo && (_jsxs(_Fragment, { children: [_jsx("span", { className: styles.statusTodo, title: status.live.todo.text, children: status.live.todo.text }), _jsx("span", { className: styles.statusSep, "aria-hidden": true, children: "\u00B7" })] })), _jsx("span", { className: styles.statusText, title: mainActivityText(status.live), children: mainActivityText(status.live) }), _jsx(SubagentsChip, { subagents: status.live.subagents, onOpenSession: onOpenSession }), status.live.startedAt && (_jsxs("span", { className: styles.statusTime, children: [formatHMS(status.live.startedAt), " \u00B7 ", formatElapsed(status.live.startedAt, nowMs)] }))] }))] }));
}
/** The empty spacer TurnList renders while lingering after the slot empties: the
 *  same box as the slot with no content and a transparent border, so the transcript
 *  holds its position until the user scrolls. Exported from here so the slot and
 *  its stand-in can never drift apart in height. */
export const STATUS_SPACER_CLASSNAME = `${styles.statusSlot} ${styles.statusSpacer}`;
//# sourceMappingURL=SessionStatusLine.js.map