/**
 * The sessions that have an open question recorded against them, across EVERY session
 * rather than the sidebar's loaded page.
 *
 * This exists because session state is the wrong thing to hang a question marker on. A
 * signal outlives the state that produced it: the agent asks, the turn ends, the session
 * settles to `completed` or is `aborted` — and the question is still open and still
 * unanswered. Measured on this host 2026-08-18: of 19 open chat signals, ZERO belonged to a
 * session in `awaiting_user`/`awaiting_permission`, so a state-gated marker drew nothing at
 * all while the original chat's inbox listed all 19.
 *
 * One request for the whole sidebar, not one per row: `useOpenSignals()` with no session id
 * is the cross-session read, and it is shared through the same 30s cache and resolve
 * announcement as every other signals surface, so answering a question anywhere clears the
 * marker here without a refetch.
 *
 * `available` is false when the server answers 404 — a bridge-server predating the signals
 * route. Callers must fall back to session state rather than concluding nothing is waiting.
 */
export declare function useSessionsWithOpenQuestion(): {
    sessionIds: ReadonlySet<string>;
    available: boolean;
};
//# sourceMappingURL=sessionsWithOpenQuestion.d.ts.map