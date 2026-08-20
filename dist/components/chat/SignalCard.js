import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { useBridgeConfig } from '../../context';
import { SignalKindNotification, SignalSeverityWarn } from '../../types';
import { acknowledgeSignal, answerDerivedQuestion, declineSignalQuestions, dismissSignal, resolveSignalQuestions, } from './signalData';
/** SignalCard renders exactly one signal record, by kind. It takes everything
 * through props and reads no session context, so the same card renders in the
 * raising session's chat, in the cross-session inbox, and inside another
 * session's RefChip panel.
 *
 * It composes an answer but never submits one: a tool question is one of
 * several sharing a parked request, and that whole request resolves at once.
 * SignalRequestCard below owns the submit. */
export function SignalCard({ signal, answer, onChangeAnswer, onAcknowledge, busy, compact }) {
    const isNotification = signal.kind === SignalKindNotification;
    const options = signal.options ?? [];
    const chosen = answer?.option ?? '';
    const text = answer?.text ?? '';
    return (_jsxs("div", { className: `bc-signal-card${compact ? ' bc-signal-card-compact' : ''}`, children: [_jsxs("div", { className: "bc-signal-card-header", children: [_jsx("span", { className: `bc-signal-kind bc-signal-kind-${isNotification ? 'notification' : 'question'}`, children: isNotification ? 'notification' : 'question' }), isNotification && signal.severity === SignalSeverityWarn && (_jsx("span", { className: "bc-signal-severity", children: "warn" }))] }), _jsx("p", { className: "bc-signal-title", children: signal.title }), signal.body && !compact && _jsx("p", { className: "bc-signal-body", children: signal.body }), !isNotification && options.length > 0 && (_jsx("div", { className: "bc-signal-options", children: options.map(option => (_jsxs("label", { className: `bc-signal-option${chosen === (option.value || option.label) ? ' bc-signal-option-selected' : ''}`, children: [_jsx("input", { type: "radio", name: `bc-signal-${signal.id}`, checked: chosen === (option.value || option.label), disabled: busy || !onChangeAnswer, onChange: () => onChangeAnswer?.({ option: option.value || option.label }) }), _jsxs("span", { className: "bc-signal-option-body", children: [_jsx("span", { className: "bc-signal-option-label", children: option.label }), option.description && !compact && (_jsx("span", { className: "bc-signal-option-desc", children: option.description }))] })] }, option.value || option.label))) })), !isNotification && signal.allow_freeform && !compact && (_jsx("textarea", { className: "bc-signal-freeform", placeholder: options.length > 0 ? '…or answer in your own words' : 'Type your answer', value: text, disabled: busy || !onChangeAnswer, onChange: e => onChangeAnswer?.({ text: e.target.value }), rows: 2 })), isNotification && onAcknowledge && (_jsx("div", { className: "bc-signal-actions", children: _jsx("button", { type: "button", className: "bc-signal-ack", disabled: busy, onClick: onAcknowledge, children: "Acknowledge" }) }))] }));
}
/** answerText is what goes on the wire for one signal: the picked option's
 * value, or the typed text. Empty means unanswered. */
function answerText(answer) {
    return (answer?.option || answer?.text || '').trim();
}
/** SignalRequestCard renders every signal minted by one parked request and
 * submits their answers together.
 *
 * One AskUserQuestion call carries several questions and resolves once, so
 * answering a single question in isolation would resolve the whole request
 * with the rest unanswered. Submit stays disabled until every question in the
 * request has an answer. */
export function SignalRequestCard({ request, onResolved, header, compact, allowDismissWithoutAnswer, }) {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [answers, setAnswers] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const questions = request.signals.filter(s => s.kind !== SignalKindNotification);
    const allAnswered = questions.length > 0 && questions.every(s => answerText(answers[s.id]) !== '');
    const setAnswer = useCallback((signalID, answer) => {
        setAnswers(prev => ({ ...prev, [signalID]: answer }));
    }, []);
    const submit = useCallback(async () => {
        if (busy || !allAnswered)
            return;
        setBusy(true);
        setError(null);
        try {
            if (request.requestId) {
                const payload = {};
                for (const signal of questions)
                    payload[signal.title] = answerText(answers[signal.id]);
                await resolveSignalQuestions(fetchFn, basePath, request.sessionId, request.requestId, payload);
            }
            else {
                // A derived question has no parked hook, so it resolves by becoming
                // the session's next user message. Grouping puts exactly one derived
                // signal in a group, so there is one answer to send.
                await answerDerivedQuestion(fetchFn, basePath, request.sessionId, answerText(answers[questions[0].id]));
            }
            onResolved?.();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [busy, allAnswered, questions, answers, fetchFn, basePath, request, onResolved]);
    const acknowledge = useCallback(async (signalID) => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await acknowledgeSignal(fetchFn, basePath, signalID);
            onResolved?.();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [busy, fetchFn, basePath, onResolved]);
    const dismiss = useCallback(async () => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            // A group of derived signals holds exactly one row today, but closing
            // every question in the group is what "dismiss this" means either way —
            // leaving a sibling open would be a half-closed request.
            for (const signal of questions)
                await dismissSignal(fetchFn, basePath, signal.id);
            onResolved?.();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [busy, questions, fetchFn, basePath, onResolved]);
    const decline = useCallback(async () => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await declineSignalQuestions(fetchFn, basePath, request.sessionId, request.requestId);
            onResolved?.();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [busy, fetchFn, basePath, request, onResolved]);
    return (_jsxs("div", { className: "bc-signal-request", children: [header, request.signals.map(signal => (_jsx(SignalCard, { signal: signal, answer: answers[signal.id], 
                // Notifications are acknowledged, not answered — they compose
                // nothing on either producer's path, and close one at a time
                // through the signal-level verb rather than with the group.
                onChangeAnswer: signal.kind === SignalKindNotification ? undefined : a => setAnswer(signal.id, a), onAcknowledge: signal.kind === SignalKindNotification ? () => acknowledge(signal.id) : undefined, busy: busy, compact: compact }, signal.id))), questions.length > 0 && (_jsxs("div", { className: "bc-signal-actions", children: [_jsx("button", { type: "button", className: "bc-signal-submit", disabled: busy || !allAnswered, onClick: submit, children: request.requestId ? 'Submit' : 'Send answer' }), allowDismissWithoutAnswer ? (_jsx("button", { type: "button", className: "bc-signal-dismiss", disabled: busy, onClick: dismiss, children: "Dismiss" })) : (request.requestId && (_jsx("button", { type: "button", className: "bc-signal-decline", disabled: busy, onClick: decline, children: "Decline" })))] })), error && _jsx("p", { className: "bc-signal-error", children: error })] }));
}
//# sourceMappingURL=SignalCard.js.map