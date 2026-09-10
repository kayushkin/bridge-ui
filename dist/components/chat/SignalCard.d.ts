import { type JSX, type ReactNode } from 'react';
import { type Signal, type SignalAnswerDraft, type SignalRequest } from '@kayushkin/chat-core';
export interface SignalCardProps {
    signal: Signal;
    /** The answer being composed for this signal. A signal is answered with
     *  options or with freeform text, NEVER both — picking one clears the other. */
    answer?: SignalAnswerDraft;
    onChangeAnswer?: (answer: SignalAnswerDraft) => void;
    /** Send this answer immediately, without waiting for a Submit.
     *
     *  Supplied ONLY when this signal is the single question in its request, so
     *  one click is the whole answer. A request carrying several questions
     *  resolves once, with every answer together, and clicking option one of
     *  question one there would resolve it with the rest blank.
     *
     *  The card uses it for a pick-ONE question only: a pick-many question is not
     *  finished until the human says it is. */
    onAnswerAndSubmit?: (answer: SignalAnswerDraft) => void;
    /** Acknowledge a notification. Left optional because a surface that cannot
     *  refetch afterwards is better off not offering the button at all — the card
     *  renders no action rather than one that leaves a resolved row on screen. */
    onAcknowledge?: () => void;
    busy?: boolean;
    /** Drops descriptions and the body for tight surfaces (the RefChip session
     *  panel). The question, its options and its freeform box all still render:
     *  compact trims chrome, never the means of answering. */
    compact?: boolean;
    /** Open showing nothing but the answers, with a disclosure that reveals the
     *  question and its summary.
     *
     *  For the chat pane, where the transcript directly above already carries the
     *  question — repeating it under the transcript is the same words twice, and
     *  the answers are the only part you cannot read further up.
     *
     *  It also drops the separate freeform box on a card that HAS options, because
     *  every option is editable: rewriting one is how you answer in your own words
     *  there. A question minted with no options keeps its box, or it would have no
     *  answer field left at all. ⚠️ The chat composer is NOT that field — a bare
     *  /send deliberately leaves a tool-parked question open
     *  (`TestAnswerDerivedQuestionsLeavesToolParksToTheHookVerb` in
     *  llm-bridge-server), because the harness is blocked on its hook, not on
     *  stdin. */
    startCollapsedToAnswers?: boolean;
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
export declare function SignalCard({ signal, answer, onChangeAnswer, onAnswerAndSubmit, onAcknowledge, busy, compact, startCollapsedToAnswers, }: SignalCardProps): JSX.Element;
export interface SignalRequestCardProps {
    request: SignalRequest;
    /** Called after a successful resolve so the surface can refetch. */
    onResolved?: () => void;
    /** Rendered above the questions — a cross-session inbox uses it for a link to
     *  the raising session; the in-session surfaces pass nothing. */
    header?: ReactNode;
    compact?: boolean;
    /** Passed to every card — see {@link SignalCardProps.startCollapsedToAnswers}. */
    startCollapsedToAnswers?: boolean;
    /** Offer to close a question nobody is going to answer.
     *
     *  Only meaningful for a DERIVED question: a parked tool question already has
     *  Decline, which denies the call the question came from, and that is the
     *  honest close there. A derived question parked nothing, so without this it
     *  stays open until the session's next turn happens to supersede it — which,
     *  on a card raised by a worker that has since stopped, is never.
     *
     *  Off by default, so a chat surface keeps answering as its only close. */
    allowDismissWithoutAnswer?: boolean;
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
export declare function SignalRequestCard({ request, onResolved, header, compact, startCollapsedToAnswers, allowDismissWithoutAnswer, }: SignalRequestCardProps): JSX.Element;
//# sourceMappingURL=SignalCard.d.ts.map