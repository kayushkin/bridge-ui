/** The canonical session states that mean "this session has stopped and is waiting on a
 *  human". Both are llm-bridge's own (`msg/provider.go`); chat-core's RefChip badges the
 *  same pair as `question` / `approval`.
 *
 *  They are listed rather than pattern-matched on the string because a state that merely
 *  LOOKS like waiting — `paused`, `rate_limited` — is not something a human can answer,
 *  and a `?` opened on one would have nothing to show. */
const AWAITING_HUMAN_STATES = new Set([
    'awaiting_user',
    'awaiting_permission',
]);
/** Whether a session's effective UI state is one a human is expected to answer. */
export function isSessionAwaitingHuman(state) {
    return AWAITING_HUMAN_STATES.has(state);
}
/** What the marker is asking for, in the user's words rather than the wire's. Used for the
 *  accessible names, so a screen reader hears "approval" and not `awaiting_permission`. */
export function humanAskedFor(state) {
    return state === 'awaiting_permission' ? 'approval' : 'question';
}
//# sourceMappingURL=sessionAwaitingHuman.js.map