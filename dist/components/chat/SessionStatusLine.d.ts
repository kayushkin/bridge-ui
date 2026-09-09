import { type LiveStatus, type LiveSubagent } from '@kayushkin/chat-core';
/** The slice of Chat's one `useComposer` instance the status slot renders.
 *  `error` is hook-local state, which is why this arrives as a prop rather than
 *  from a second hook call that would never see it. */
export interface ComposerStatus {
    paused: boolean;
    resumable: boolean;
    error: string | null;
    /** Which action `error` describes, for phrasing — set by the Composer's handlers. */
    failedAction: 'stop' | 'resume' | null;
}
/** What the slot shows, in priority order — each kind replaces everything below it.
 *  null = nothing to say (the slot disappears, its spacer may linger). */
export type SessionStatus = {
    kind: 'error';
    text: string;
} | {
    kind: 'disconnected';
    text: string;
} | {
    kind: 'stopped';
} | {
    kind: 'paused';
} | {
    kind: 'compacting';
} | {
    kind: 'live';
    live: LiveStatus;
} | null;
/**
 * Decide the slot's current content. Priority: an action failure outranks
 * everything (the user just clicked something that refused); a dead stream
 * outranks session facts (nothing below it can be trusted live); stopped/paused
 * outrank compacting/live because they are mutually exclusive with a running
 * turn; live activity keeps the chat-core rule — never gated on session state
 * alone, a non-idle activity is itself evidence of work.
 */
export declare function useSessionStatus(sessionId: string | null, streaming: boolean, compacting: boolean, composerStatus: ComposerStatus): SessionStatus;
interface SessionStatusLineProps {
    /** The decided status. Never null — the parent renders nothing (or the spacer)
     *  instead of this component when there is nothing to say. */
    status: NonNullable<SessionStatus>;
    /** Opens a subagent's promoted session — TurnList's `select`. */
    onOpenSession: (sessionId: string) => void;
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
export declare function SubagentsChip({ subagents, onOpenSession, }: {
    subagents: readonly LiveSubagent[];
    onOpenSession: (sessionId: string) => void;
}): import("react/jsx-runtime").JSX.Element | null;
export default function SessionStatusLine({ status, onOpenSession }: SessionStatusLineProps): import("react/jsx-runtime").JSX.Element;
/** The empty spacer TurnList renders while lingering after the slot empties: the
 *  same box as the slot with no content and a transparent border, so the transcript
 *  holds its position until the user scrolls. Exported from here so the slot and
 *  its stand-in can never drift apart in height. */
export declare const STATUS_SPACER_CLASSNAME: string;
export {};
//# sourceMappingURL=SessionStatusLine.d.ts.map