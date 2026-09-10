interface SessionTokens {
    input: number;
    output: number;
}
interface SessionAggregate {
    session_id: string;
    input_tokens: number;
    output_tokens: number;
}
/** A session the token column can show a number for. `empty` sessions never
 *  had a turn, so they are excluded here and never counted as missing. */
type TokenColumnSession = {
    sessionId: string;
    state: string;
};
/** True when some session on screen has no token total yet, which is what
 *  makes the page ask the server for the aggregate. */
export declare function sessionTokenTotalsAreMissing(sessions: TokenColumnSession[], known: Map<string, SessionTokens>): boolean;
/**
 * Folds one GET /sessions/aggregates response into the token map.
 *
 * Sessions the aggregate omits (log-store leaves out any session with no
 * usage at all) are recorded as zero rather than left absent. Without that,
 * `sessionTokenTotalsAreMissing` would stay true for them forever and the
 * page would re-fetch the whole aggregate on every render.
 */
export declare function applySessionAggregates(known: Map<string, SessionTokens>, aggregates: SessionAggregate[], onScreen: TokenColumnSession[]): Map<string, SessionTokens>;
/** Every session as a flat table, over the SAME store and the SAME filter the
 *  chat sidebar reads. This page used to hold a second copy of the list — its
 *  own `GET /sessions` seed and `/session-events` stream, its own transcript
 *  search — that predated chat-core and was never moved when the chat was.
 *  Filtering here now filters the sidebar and vice versa, which is the honest
 *  consequence of one list: the two were never different sessions.
 *
 *  The page's dropdowns are single-select over chat-core's multi-select axes,
 *  so each writes a one-element list and shows the first element back.
 *  `machine` is the instance axis (it matches `SessionSummary.instanceId`). */
export declare function BridgeSessions(): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BridgeSessions.d.ts.map