import type { JSX } from 'react';
import { type SignalRequest } from '@kayushkin/chat-core';
export interface SessionSignalsProps {
    sessionId: string;
    compact?: boolean;
    /** Heading above the cards. Omit for surfaces tight enough that the card's own
     *  "question"/"notification" label is heading enough. */
    title?: string;
}
/**
 * SessionSignals is the open chat signals raised by ONE session, answerable in
 * place. Renders nothing when the session has none, or when this bridge-server
 * has no signals route.
 *
 * It used to take `excludeRequestIds`, so a host could drop the questions its
 * own permission banner was already drawing from the live tool input. That prop
 * was the last place a client still had to know which producer raised a
 * question. It is gone because the duplication it worked around is: the record
 * now carries `allowMultipleOptions`, which was the one thing the banner could
 * render and the card could not, so a host has no reason left to draw a second
 * form for a question that is already on this one.
 *
 * Ported from bridge-ui's `SessionSignals.tsx`.
 */
export declare function SessionSignals({ sessionId, compact, title, }: SessionSignalsProps): JSX.Element | null;
export interface SignalRequestListProps {
    requests: readonly SignalRequest[];
    compact?: boolean;
    title?: string;
    onResolved?: () => void;
    /** Passed through to every card — see `SignalRequestCard`. */
    allowDismissWithoutAnswer?: boolean;
    /** Passed through to every card — see `SignalCardProps.startCollapsedToAnswers`. */
    startCollapsedToAnswers?: boolean;
}
/**
 * The rendered list of request groups, with no fetching of its own.
 *
 * Split out from {@link SessionSignals} so a host with its own source of signals
 * — a cross-session "Needs you" inbox, a kanban card drawer — renders the same
 * cards without going through the per-session read. It also makes the empty case
 * assertable: a bridge-server with no signals route yields zero requests, and
 * this renders nothing at all rather than an empty box or an error.
 */
export declare function SignalRequestList({ requests, compact, title, onResolved, allowDismissWithoutAnswer, startCollapsedToAnswers, }: SignalRequestListProps): JSX.Element | null;
//# sourceMappingURL=SessionSignals.d.ts.map