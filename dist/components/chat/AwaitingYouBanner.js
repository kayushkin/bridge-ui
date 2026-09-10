import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { groupSignalsByRequest, useOpenSignals, usePendingPermissions, HOOK_SOURCE_USER_INPUT } from '@kayushkin/chat-core';
import { SignalRequestList } from './SessionSignals';
/** Everything the open session is waiting on a human for, in one place.
 *
 *  Two things reach it, and they are genuinely different:
 *
 *   - **Open signals** — the canonical record of a question or a notification.
 *     Rendered by chat-core's own card and answered through
 *     `POST /signals/{id}/answer`, which is the one door however the question
 *     was raised and whether or not the session is still running.
 *   - **Parked tool calls with no signal behind them** — a permission gate.
 *     Answered allow or deny, once. There is no record to answer here and
 *     nothing to say beyond yes or no, so it keeps its own card.
 *
 *  This used to be `PermissionBanner`, and it drew AskUserQuestion itself, from
 *  the live tool input. That made the SAME question renderable twice — once
 *  here and once as a signal card — so every surface that showed signals had to
 *  be told which request ids the banner had already taken (`excludeRequestIds`,
 *  now deleted). The duplication existed for one reason: `multiSelect` lived
 *  only in the tool input, so only this component could offer a pick-many
 *  question. It is on the signal record now (`allowMultipleOptions`), and with
 *  it the second renderer had nothing left that the first could not do.
 *
 *  Answering here is also what puts questions in front of a human at all when
 *  the session is open. A parked ask always showed up, because it was on the
 *  live hook stream; a DERIVED question and a question whose park has died
 *  never did — they exist only as records, and chat rendered no records in
 *  the chat pane. They appeared solely in the sidebar `?` dropdown, which is
 *  the surface for the sessions you are NOT looking at.
 *
 *  Renders nothing when there is nothing waiting.
 *
 *  Takes a session id, NOT `string | null`, and the caller guards. `useOpenSignals`
 *  reads across EVERY session when given no id — that is how the sidebar builds its
 *  marker list — so a null threaded through here would fill the chat pane with other
 *  sessions' questions the moment no session was selected. A cross-session inbox is a
 *  real surface and a different one: each card there has to say which session it
 *  belongs to, and this banner's cards deliberately do not.
 *
 *  Deliberately WITHOUT the "always allow / always deny" buttons the bridge-ui
 *  banner carries: those write a priority-200 global rule into permission-store,
 *  and the live rule set is under an open safety review. A one-shot decision is
 *  the whole of what a parked call needs; standing rules stay a deliberate trip
 *  to the permission page. */
export default function AwaitingYouBanner({ sessionId }) {
    const { signals, error, reload } = useOpenSignals(sessionId);
    const { pending, resolve } = usePendingPermissions(sessionId);
    const requests = useMemo(() => groupSignalsByRequest(signals), [signals]);
    // A parked request is "covered" when a signal row was minted from it, because
    // the signal cards below already render that row. Everything left over is a
    // gate.
    //
    // When the signals read FAILS, nothing is covered and every parked request —
    // questions included — falls through to a permission card. That is the right
    // way round: the raw card is uglier and says less, but the session stays
    // answerable. Hiding a parked call because a SEPARATE read failed would
    // freeze it with nothing on screen to say why.
    const uncoveredParks = useMemo(() => {
        const covered = new Set(signals.map(s => s.requestId).filter(id => id !== ''));
        return pending.filter(hook => !covered.has(hook.requestId));
    }, [signals, pending]);
    if (requests.length === 0 && uncoveredParks.length === 0 && error === null)
        return null;
    return (_jsxs("div", { className: "bc-pending-banner", role: "region", "aria-label": "Waiting on you", children: [error !== null && (_jsxs("p", { className: "bc-pending-error", children: ["Couldn\u2019t load this session\u2019s questions: ", error] })), uncoveredParks.map(hook => (_jsx(PermissionCard, { hook: hook, resolve: resolve }, hook.requestId))), _jsx(SignalRequestList, { requests: requests, onResolved: reload, startCollapsedToAnswers: true })] }));
}
/** A parked tool call answered once, allow or deny.
 *
 *  Reached by every permission gate, and by the one degraded case: a
 *  `user_input` park whose signal row was never written. Recording a signal is
 *  observational on the server — it must not block the park — so a failed write
 *  leaves a question with no record. It lands here rather than nowhere, because
 *  a parked call with no card freezes the session invisibly, and the raw input
 *  is at least the truth about what was asked. */
function PermissionCard({ hook, resolve }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const tool = hook.toolName || '';
    // Bash is the case where the raw JSON hides the one thing that matters. Every other
    // tool's input is shown as it arrived — this layer reshapes nothing.
    const command = tool === 'Bash' ? String(readField(hook.input, 'command') ?? '') : '';
    const preview = tool === 'Bash' ? command || '(empty command)' : JSON.stringify(hook.input ?? {}, null, 2);
    const isUnrecordedQuestion = hook.source === HOOK_SOURCE_USER_INPUT;
    const decide = useCallback(async (behavior) => {
        setBusy(true);
        setError(null);
        try {
            await resolve({ requestId: hook.requestId, behavior });
        }
        catch (e) {
            // resolve() puts the card back when the server refuses; say why, because the
            // tool call is still parked and the user has to answer it again.
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [hook.requestId, resolve]);
    return (_jsxs("div", { className: "bc-pending-card", children: [_jsxs("div", { className: "bc-pending-card-header", children: [_jsx("strong", { className: "bc-pending-tool", children: tool || hook.event || 'tool call' }), _jsx("span", { className: "bc-pending-event", children: hook.event })] }), isUnrecordedQuestion && (_jsx("p", { className: "bc-pending-note", children: "This question has no signal record, so it can only be allowed or denied here \u2014 not answered." })), _jsx("pre", { className: "bc-pending-input", children: preview }), _jsxs("div", { className: "bc-pending-actions", children: [_jsx("button", { type: "button", className: "bc-pending-allow", disabled: busy, onClick: () => decide('allow'), children: "Allow once" }), _jsx("button", { type: "button", className: "bc-pending-deny", disabled: busy, onClick: () => decide('deny'), children: "Deny" })] }), error && _jsx("p", { className: "bc-pending-error", children: error })] }));
}
/** Read one string-keyed field off a raw hook input without asserting its shape. */
function readField(input, key) {
    if (!input || typeof input !== 'object')
        return undefined;
    return input[key];
}
//# sourceMappingURL=AwaitingYouBanner.js.map