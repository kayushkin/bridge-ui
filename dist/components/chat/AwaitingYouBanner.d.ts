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
export default function AwaitingYouBanner({ sessionId }: {
    sessionId: string;
}): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=AwaitingYouBanner.d.ts.map