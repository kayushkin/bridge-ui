import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { useChatContext } from '@kayushkin/chat-core';
import { SIGNAL_KIND_NOTIFICATION, SIGNAL_SEVERITY_WARN, } from '@kayushkin/chat-core';
import { acknowledgeSignal, answerSignalRequest, dismissSignal, everyQuestionAnswered, questionsIn, } from '@kayushkin/chat-core';
/** Whether a card renders its own freeform answer box.
 *
 *  Read by {@link SignalRequestCard} as well as by the card, because the box is
 *  the one thing a Submit button is still needed for once a question answers on
 *  the click. One rule, one place. */
function rendersFreeformBox(signal, startCollapsedToAnswers) {
    if (signal.kind === SIGNAL_KIND_NOTIFICATION)
        return false;
    return !(startCollapsedToAnswers && signal.options.length > 0);
}
/**
 * SignalCard renders exactly one signal record, by kind. It takes EVERYTHING
 * through props and reads no context at all, so the same card renders in the
 * raising session's chat, in a cross-session inbox, and inside another session's
 * RefChip panel.
 *
 * It composes an answer, and submits one only when the surface hands it
 * {@link SignalCardProps.onAnswerAndSubmit} — which a surface does only for a
 * request holding this question and no other. Everything else resolves through
 * {@link SignalRequestCard} below, because a tool question is one of several
 * sharing a parked request and that whole request resolves at once.
 */
export function SignalCard({ signal, answer, onChangeAnswer, onAnswerAndSubmit, onAcknowledge, busy, compact, startCollapsedToAnswers, }) {
    const isNotification = signal.kind === SIGNAL_KIND_NOTIFICATION;
    const options = signal.options;
    const chosen = answer?.pickedOptionValues ?? [];
    const text = answer?.text ?? '';
    // The record is the ONLY authority on this. Never inferred from the option
    // count or the question's wording: offering a pick-many form for a pick-one
    // question lets a human send an answer the tool will refuse, and offering a
    // pick-one form for a pick-many one silently drops every choice after the
    // first.
    const multiple = !isNotification && signal.allowMultipleOptions;
    // A pick-one question is answered BY the click, so it draws plain buttons and
    // no radio group: a radio's whole job is to hold a choice until a Submit, and
    // there is no Submit to hold it for. Radios stay on nothing; checkboxes stay
    // on the pick-many form, which really does wait.
    const submitsOnPick = !multiple && onAnswerAndSubmit !== undefined;
    // A notification IS its title, so it is never collapsed — there would be
    // nothing left of it.
    const collapsible = startCollapsedToAnswers === true && !isNotification;
    const [questionShown, setQuestionShown] = useState(false);
    const questionVisible = !collapsible || questionShown;
    /** The text of one option that has been rewritten, keyed by the option's own
     *  value. Local, ephemeral view state: what the human typed goes into the
     *  composed answer immediately, and this only remembers it so the row keeps
     *  showing the edit instead of snapping back to the label. */
    const [editedTextByOptionValue, setEditedTextByOptionValue] = useState({});
    const [optionBeingEdited, setOptionBeingEdited] = useState(null);
    const [editDraft, setEditDraft] = useState('');
    /** Pick one option, replacing whatever was picked before. */
    const chooseOne = (value) => {
        const draft = { pickedOptionValues: [value] };
        if (submitsOnPick)
            onAnswerAndSubmit?.(draft);
        else
            onChangeAnswer?.(draft);
    };
    /** Add or remove one option on a pick-many question. Toggling replaces the
     *  composed answer, which is what clears any typed text. */
    const toggleOption = (value) => {
        const next = chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];
        onChangeAnswer?.({ pickedOptionValues: next });
    };
    /** Open the editor on one option. `startingText` is what the human reads on the
     *  row, which is the thing they are about to amend — see the field itself. */
    const startEditing = (optionValue, startingText) => {
        setOptionBeingEdited(optionValue);
        setEditDraft(startingText);
    };
    const cancelEditing = () => {
        setOptionBeingEdited(null);
        setEditDraft('');
    };
    const commitEdit = (optionValue) => {
        const rewritten = editDraft.trim();
        // An empty answer is not an answer: `answerTextOf` reads it as unanswered,
        // so committing it would leave a filled-in-looking field and a request that
        // will not submit. The editor stays open instead.
        if (rewritten === '')
            return;
        const previous = editedTextByOptionValue[optionValue] ?? optionValue;
        setEditedTextByOptionValue((prev) => ({ ...prev, [optionValue]: rewritten }));
        setOptionBeingEdited(null);
        setEditDraft('');
        // Rewriting an answer is choosing it — nobody retypes an option they are not
        // going to send.
        if (multiple) {
            onChangeAnswer?.({
                pickedOptionValues: [...chosen.filter((v) => v !== previous), rewritten],
            });
        }
        else {
            chooseOne(rewritten);
        }
    };
    return (_jsxs("div", { className: `signal-card${compact ? ' signal-card-compact' : ''}${collapsible && !questionShown ? ' signal-card-answers-only' : ''}`, "data-signal-id": signal.id, children: [_jsxs("div", { className: "signal-card-header", children: [collapsible ? (_jsxs("button", { type: "button", className: "signal-disclosure", "aria-expanded": questionShown, "aria-label": questionShown ? 'Hide the question' : 'Show the question', title: questionShown ? 'Hide the question' : 'Show the question', onClick: () => setQuestionShown((shown) => !shown), children: [_jsx("span", { className: "signal-disclosure-caret", "aria-hidden": true, children: questionShown ? '▾' : '▸' }), _jsx("span", { className: "signal-kind signal-kind-question", children: "question" })] })) : (_jsx("span", { className: `signal-kind signal-kind-${isNotification ? 'notification' : 'question'}`, children: isNotification ? 'notification' : 'question' })), isNotification && signal.severity === SIGNAL_SEVERITY_WARN && (_jsx("span", { className: "signal-severity", children: "warn" }))] }), questionVisible && _jsx("p", { className: "signal-title", children: signal.title }), signal.body !== '' && !compact && questionVisible && (_jsx("p", { className: "signal-body", children: signal.body })), !isNotification && options.length > 0 && (_jsx("div", { className: "signal-options", children: options.map((option) => {
                    // `value` is what the resolve verb sends back; producers with no
                    // separate machine value set it to the label, so the label is the
                    // fallback rather than an invention.
                    const optionValue = option.value || option.label;
                    const rewritten = editedTextByOptionValue[optionValue];
                    // What this row will actually send, rewritten or not. Selection is
                    // tested against it, so an edited option stays picked.
                    const answerValue = rewritten ?? optionValue;
                    const shownLabel = rewritten ?? option.label;
                    const picked = chosen.includes(answerValue);
                    const editing = optionBeingEdited === optionValue;
                    const body = (_jsxs("span", { className: "signal-option-body", children: [_jsx("span", { className: "signal-option-label", children: shownLabel }), option.description !== '' && !compact && questionVisible && (_jsx("span", { className: "signal-option-desc", children: option.description }))] }));
                    return (_jsx("div", { className: `signal-option${picked ? ' signal-option-selected' : ''}${editing ? ' signal-option-editing' : ''}`, children: editing ? (_jsxs(_Fragment, { children: [_jsx("input", { className: "signal-option-edit-input", 
                                    // Prefilled with the LABEL — the words on the row — and not
                                    // with the option's machine value, on the one thing this
                                    // control is for: amending the answer you are reading.
                                    // "b" is not amendable into "b, but staging first"; the
                                    // sentence it stands for is. The cost is that opening the
                                    // editor on an option whose value differs from its label
                                    // and pressing Enter sends the label, which is visible in
                                    // the field the whole time — where sending an unreadable
                                    // token would not be.
                                    value: editDraft, autoFocus: true, disabled: busy, "aria-label": `Answer instead of “${option.label}”`, onChange: (e) => setEditDraft(e.target.value), onKeyDown: (e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            commitEdit(optionValue);
                                        }
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            cancelEditing();
                                        }
                                    } }), _jsx("button", { type: "button", className: "signal-option-save", disabled: busy || editDraft.trim() === '', onClick: () => commitEdit(optionValue), children: submitsOnPick ? 'Answer' : 'Use' })] })) : (_jsxs(_Fragment, { children: [multiple ? (_jsxs("label", { className: "signal-option-choice", children: [_jsx("input", { 
                                            // A checkbox is the whole visible difference between
                                            // "pick any that apply" and "pick one", and a human
                                            // reads it before touching anything. It is driven
                                            // straight off the record so the form cannot promise a
                                            // choice the tool will not take.
                                            type: "checkbox", checked: picked, disabled: busy || !onChangeAnswer, onChange: () => toggleOption(answerValue) }), body] })) : (_jsx("button", { type: "button", className: "signal-option-choice signal-option-pick", "aria-pressed": submitsOnPick ? undefined : picked, disabled: busy || !onChangeAnswer, onClick: () => chooseOne(answerValue), children: body })), _jsx("button", { type: "button", className: "signal-option-edit", "aria-label": `Rewrite “${shownLabel}”`, title: "Rewrite this answer", disabled: busy || !onChangeAnswer, onClick: () => startEditing(optionValue, shownLabel || answerValue), children: "\u270E" })] })) }, optionValue));
                }) })), rendersFreeformBox(signal, startCollapsedToAnswers === true) && (_jsx("textarea", { className: "signal-freeform", placeholder: options.length > 0 ? '…or answer in your own words' : 'Type your answer', value: text, disabled: busy || !onChangeAnswer, onChange: (e) => onChangeAnswer?.({ text: e.target.value }), rows: 2 })), isNotification && onAcknowledge && (_jsx("div", { className: "signal-actions", children: _jsx("button", { type: "button", className: "signal-ack", disabled: busy, onClick: onAcknowledge, children: "Acknowledge" }) }))] }));
}
/**
 * SignalRequestCard renders every signal minted by one parked request and
 * submits their answers TOGETHER.
 *
 * One AskUserQuestion call carries several questions and resolves once, so
 * answering a single question in isolation would resolve the whole request with
 * the rest unanswered. Submit stays disabled until every question in the request
 * has an answer — and the one shape where that leaves nothing to wait for, a
 * request holding a single pick-one question, answers on the click instead and
 * draws no Submit at all.
 *
 * ⚠️ The only thing this reads from context is the `ApiClient` singleton — never
 * the active session. Which session it is answering comes from `request`, and
 * that is precisely why it can be mounted inside another session's RefChip panel
 * and answer a question the user is not looking at.
 */
export function SignalRequestCard({ request, onResolved, header, compact, startCollapsedToAnswers, allowDismissWithoutAnswer, }) {
    const { api } = useChatContext();
    const [answers, setAnswers] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const questions = questionsIn(request);
    const allAnswered = everyQuestionAnswered(request, answers);
    /** The question that answers on a click, or null.
     *
     *  Three conditions, each of them load-bearing: it is the ONLY question in the
     *  request (the request resolves once, with everything), it takes ONE choice
     *  (a pick-many answer is not finished until the human says so), and it HAS
     *  options (nothing to click otherwise). */
    const sole = questions.length === 1 ? questions[0] : undefined;
    const answersOnPick = sole !== undefined && !sole.allowMultipleOptions && sole.options.length > 0 ? sole : null;
    // The Submit button survives auto-submit only where a freeform box does: text
    // typed into that box has nothing else to send it.
    const submitShown = answersOnPick === null ||
        rendersFreeformBox(answersOnPick, startCollapsedToAnswers === true);
    const setAnswer = useCallback((signalId, answer) => {
        setAnswers((prev) => ({ ...prev, [signalId]: answer }));
    }, []);
    /** Every action here is the same three steps around a different verb: hold the
     *  card busy, surface any refusal in place, and let the surface refetch on
     *  success. A failed resolve must leave the card on screen — the question is
     *  still open and the only way out is another click. */
    const run = useCallback(async (verb) => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            await verb();
            onResolved?.();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [busy, onResolved]);
    /** Send a specific set of answers. Takes them as an argument rather than
     *  reading state, because the click that completes an answer has to submit the
     *  map INCLUDING that answer — a `setAnswers` before a read would still see the
     *  old one. */
    const submitAnswers = useCallback((composed) => {
        if (!everyQuestionAnswered(request, composed))
            return;
        // One verb for both producers: it sends a tool request's answers back
        // through its parked hook, and a derived question's answer as the session's
        // next message. The branch lives in the store, not in this card.
        void run(() => answerSignalRequest(api, request, composed));
    }, [run, api, request]);
    const submit = useCallback(() => {
        submitAnswers(answers);
    }, [submitAnswers, answers]);
    const answerAndSubmit = useCallback((signalId, answer) => {
        const composed = { ...answers, [signalId]: answer };
        setAnswers(composed);
        submitAnswers(composed);
    }, [answers, submitAnswers]);
    const acknowledge = useCallback((signalId) => {
        void run(() => acknowledgeSignal(api, signalId));
    }, [run, api]);
    const dismiss = useCallback(() => {
        // A group of derived signals holds exactly one row today, but closing every
        // question in the group is what "dismiss this" means either way — leaving a
        // sibling open would be a half-closed request.
        void run(async () => {
            for (const signal of questions)
                await dismissSignal(api, signal.id);
        });
    }, [run, api, questions]);
    return (_jsxs("div", { className: "signal-request", "data-session-id": request.sessionId, "data-request-id": request.requestId, children: [header, request.signals.map((signal) => (_jsx(SignalCard, { signal: signal, answer: answers[signal.id], 
                // Notifications are acknowledged, not answered — they compose nothing
                // on either producer's path, and close one at a time through the
                // signal-level verb rather than with the group.
                onChangeAnswer: signal.kind === SIGNAL_KIND_NOTIFICATION ? undefined : (a) => setAnswer(signal.id, a), onAnswerAndSubmit: answersOnPick !== null && answersOnPick.id === signal.id
                    ? (a) => answerAndSubmit(signal.id, a)
                    : undefined, onAcknowledge: signal.kind === SIGNAL_KIND_NOTIFICATION ? () => acknowledge(signal.id) : undefined, busy: busy, compact: compact, startCollapsedToAnswers: startCollapsedToAnswers }, signal.id))), questions.length > 0 && (submitShown || allowDismissWithoutAnswer === true) && (_jsxs("div", { className: "signal-actions", children: [submitShown && (_jsx("button", { type: "button", className: "signal-submit", disabled: busy || !allAnswered, onClick: submit, children: "Answer" })), allowDismissWithoutAnswer && (_jsx("button", { type: "button", className: "signal-dismiss", disabled: busy, onClick: dismiss, children: "Dismiss" }))] })), error !== null && _jsx("p", { className: "signal-error", children: error })] }));
}
//# sourceMappingURL=SignalCard.js.map