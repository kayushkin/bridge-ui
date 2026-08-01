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
    session_id: string;
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
export declare function BridgeSessions(): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BridgeSessions.d.ts.map