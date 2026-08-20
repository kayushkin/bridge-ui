import { type ReactNode } from 'react';
import type { Signal, SignalAnswer } from '../../types';
import { type SignalRequest } from './signalData';
export interface SignalCardProps {
    signal: Signal;
    /** The answer being composed for this signal. A signal is answered with an
     * option or with freeform text, never both — picking one clears the other. */
    answer?: SignalAnswer;
    onChangeAnswer?: (answer: SignalAnswer) => void;
    /** Acknowledge a notification. Left optional because a surface that cannot
     * refetch afterwards is better off not offering the button at all — the card
     * renders no action rather than one that leaves a resolved row on screen. */
    onAcknowledge?: () => void;
    busy?: boolean;
    /** Drops descriptions and the freeform box for tight surfaces (the RefChip
     * session panel). The question and its options still render — a compact card
     * is still answerable. */
    compact?: boolean;
}
/** SignalCard renders exactly one signal record, by kind. It takes everything
 * through props and reads no session context, so the same card renders in the
 * raising session's chat, in the cross-session inbox, and inside another
 * session's RefChip panel.
 *
 * It composes an answer but never submits one: a tool question is one of
 * several sharing a parked request, and that whole request resolves at once.
 * SignalRequestCard below owns the submit. */
export declare function SignalCard({ signal, answer, onChangeAnswer, onAcknowledge, busy, compact }: SignalCardProps): import("react/jsx-runtime").JSX.Element;
export interface SignalRequestCardProps {
    request: SignalRequest;
    /** Called after a successful resolve so the surface can refetch. */
    onResolved?: () => void;
    /** Rendered above the questions — the inbox uses it for a link to the
     * raising session, the in-session surfaces pass nothing. */
    header?: ReactNode;
    compact?: boolean;
    /** Offer to close a question nobody is going to answer, whatever raised it.
     *
     * This used to be honoured for DERIVED questions only — the button was
     * gated on `!request.requestId` — on the reasoning that a parked tool
     * question already had Decline. That reasoning has a hole: a `requestId`
     * says a park EXISTED, not that it is still live. When the asking process
     * has gone, Decline denies a hook nobody is holding and fails, and the
     * gate meant Dismiss was never offered instead. So a worker's tool-raised
     * blocker had NO working close at all — exactly the case the kanban drawer
     * is for, and exactly the case its own comment claimed to handle.
     *
     * Dismiss is safe for both now because the SERVER decides what it means:
     * `POST /signals/{id}/resolve {state:"dismissed"}` denies the parked call
     * when the park is still live, and closes the row when it is not.
     *
     * Off by default, so the chat surfaces keep answering as their only close.
     * A surface that passes this gets Dismiss INSTEAD of Decline, never both —
     * two buttons for one act is what sent the caller looking for evidence it
     * does not have. */
    allowDismissWithoutAnswer?: boolean;
}
/** SignalRequestCard renders every signal minted by one parked request and
 * submits their answers together.
 *
 * One AskUserQuestion call carries several questions and resolves once, so
 * answering a single question in isolation would resolve the whole request
 * with the rest unanswered. Submit stays disabled until every question in the
 * request has an answer. */
export declare function SignalRequestCard({ request, onResolved, header, compact, allowDismissWithoutAnswer, }: SignalRequestCardProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SignalCard.d.ts.map