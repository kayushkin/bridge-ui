/** The surface for llm-bridge-server's spend halt: the session reached its ceiling, the
 *  server interrupted it, and every further send, resume and mode switch is refused with
 *  a 402 until the ceiling moves.
 *
 *  Before this, chat showed nothing at all. The mid-turn interrupt was one error event
 *  among many and the 402 never reached the page — `useComposer.send` discarded it — so a
 *  halted session looked like a hung one. That is the wrong conclusion twice over: the
 *  session is fine, and the one control that fixes it is a number in a box.
 *
 *  Renders nothing when there is no halt, which is every session under its ceiling, every
 *  session without one, and every server that predates the gate.
 *
 *  Reuses bridge-ui's `bc-budget-banner-*` classes, which dash already loads globally from
 *  `@kayushkin/bridge-ui/styles.css`, so the two chats look the same.
 *
 *  Only the 402 body names both dollar figures (`budgetHaltFromRefusal`); a halt raised by
 *  the mid-turn error event carries neither, and used to render the server's raw sentence
 *  because there was nowhere else to read them. There is now: the same
 *  `GET /sessions/{id}` detail the header reads holds the persisted pair the gate itself
 *  compares. It is NOT the summary wire — `spend_usd`/`max_budget_usd` stay off
 *  `chat_wire.go` on purpose, because a halt is a response and not a row, and widening
 *  the sidebar query for every session to describe the rare one is the trade this avoids.
 *  The detail read is per-session, lazy and already cached by the store, so the fallback
 *  costs nothing the header has not already paid.
 *
 *  The halt's own figures still win where it has them: they are the numbers as of the
 *  moment the request was refused, while the row is whatever has been persisted since. */
export default function BudgetBanner({ sessionId }: {
    sessionId: string | null;
}): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=BudgetBanner.d.ts.map