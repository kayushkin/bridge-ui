import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { SignalRequestCard } from './SignalCard';
import { groupSignalsByRequest, useOpenChatSignals } from './signalData';
/** SessionSignals is the open chat signals raised by one session, answerable
 * in place. Renders nothing when the session has none, when the surrounding
 * surface already renders all of them, or when this bridge-server has no
 * signals route. */
export function SessionSignals({ sessionId, excludeRequestIds, compact, title }) {
    // The pending-hook set is the one thing a caller already knows that changes
    // when a signal is minted or closed, so it doubles as the refresh trigger —
    // there is no signal event on the SSE stream yet.
    const excluded = excludeRequestIds ?? [];
    const { signals, error, reload } = useOpenChatSignals(sessionId, excluded.join(','));
    const shown = signals.filter(s => !s.request_id || !excluded.includes(s.request_id));
    if (error)
        return _jsxs("p", { className: "bc-signal-error", children: ["Couldn\u2019t load signals: ", error] });
    if (shown.length === 0)
        return null;
    return (_jsxs("div", { className: "bc-signals", role: "region", "aria-label": "Session signals", children: [title && _jsx("div", { className: "bc-signals-title", children: title }), groupSignalsByRequest(shown).map(request => (_jsx(SignalRequestCard, { request: request, compact: compact, onResolved: reload }, request.requestId || request.signals[0].id)))] }));
}
/** SignalsInbox is every open chat signal across every session — the "Needs
 * you" list. Renders nothing when there are none or when this bridge-server
 * has no signals route. */
export function SignalsInbox({ onSelectSession, getSessionName, refreshKey }) {
    const { signals, error, reload } = useOpenChatSignals(undefined, refreshKey);
    if (error)
        return _jsxs("p", { className: "bc-signal-error", children: ["Couldn\u2019t load signals: ", error] });
    if (signals.length === 0)
        return null;
    const requests = groupSignalsByRequest(signals);
    return (_jsxs("div", { className: "bc-signals bc-signals-inbox", role: "region", "aria-label": "Signals needing you", children: [_jsxs("div", { className: "bc-signals-title", children: ["Needs you", _jsx("span", { className: "bc-signals-count", children: requests.length })] }), requests.map(request => (_jsx(SignalRequestCard, { request: request, onResolved: reload, header: _jsx("button", { type: "button", className: "bc-signals-session", disabled: !onSelectSession, onClick: () => onSelectSession?.(request.sessionId), title: "Open this session", children: getSessionName?.(request.sessionId) || request.sessionId }) }, request.requestId || request.signals[0].id)))] }));
}
//# sourceMappingURL=SessionSignals.js.map