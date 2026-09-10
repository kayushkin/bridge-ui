import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { SignalRequestCard } from './SignalCard';
import { useOpenSignals } from '@kayushkin/chat-core';
import { groupSignalsByRequest } from '@kayushkin/chat-core';
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
export function SessionSignals({ sessionId, compact, title, }) {
    const { signals, error, reload } = useOpenSignals(sessionId);
    if (error !== null)
        return _jsxs("p", { className: "signal-error", children: ["Couldn\u2019t load signals: ", error] });
    return (_jsx(SignalRequestList, { requests: groupSignalsByRequest(signals), compact: compact, title: title, onResolved: reload }));
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
export function SignalRequestList({ requests, compact, title, onResolved, allowDismissWithoutAnswer, startCollapsedToAnswers, }) {
    if (requests.length === 0)
        return null;
    return (_jsxs("div", { className: "signals", role: "region", "aria-label": "Session signals", children: [title !== undefined && title !== '' && _jsx("div", { className: "signals-title", children: title }), requests.map((request) => (_jsx(SignalRequestCard
            // A derived group has no request id, so it is keyed by its one
            // signal's id — never by the empty string, which every derived group
            // would share.
            , { request: request, compact: compact, onResolved: onResolved, allowDismissWithoutAnswer: allowDismissWithoutAnswer, startCollapsedToAnswers: startCollapsedToAnswers }, request.requestId || request.signals[0]?.id)))] }));
}
//# sourceMappingURL=SessionSignals.js.map