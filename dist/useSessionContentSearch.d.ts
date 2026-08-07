import type { FetchFn } from './types';
/**
 * Transcript-text match counts from `GET /sessions/search`, keyed by session id.
 * The endpoint is the same one the chat sidebar and the Sessions page both union
 * into their lists, so both read the same shape.
 */
export type SessionContentSearchHits = Map<string, number>;
export type SessionContentSearch = {
    /**
     * Match counts by session id, or null when there is no usable answer — which
     * covers both "nothing has been asked" and "the ask failed". Callers must not
     * read null as "the transcripts matched nothing": an empty non-null map is
     * what says that.
     */
    hits: SessionContentSearchHits | null;
    /** True from the keystroke, through the debounce, until the request settles. */
    searching: boolean;
    /** Why the content search for the live query failed, or null if it did not.
     *  Non-null means the list is showing whatever it could match WITHOUT the
     *  server — say so, because a transcript search that errored is otherwise
     *  indistinguishable from one that found nothing. Named to match chat-core's
     *  `searchError`, which is the same contract. */
    error: string | null;
};
/** How long the query sits still before the request leaves. */
export declare const SESSION_CONTENT_SEARCH_DEBOUNCE_MS = 300;
/**
 * Reads `GET /sessions/search` for a query, debounced.
 *
 * **A failure is not an empty result.** Both callers used to answer a failed
 * search with an empty hit set, and an empty hit set means "your words appear in
 * no transcript". So a 502 from log-store rendered as a confident negative: the
 * sidebar silently dropped every content-only match and said "No sessions match
 * this search", and the Sessions page — where these hits are the only filter —
 * emptied the list outright and reported "0 matches". Nothing on screen said the
 * search had not run, and the error case is the one nobody tests by hand.
 *
 * The contract instead: a failure keeps `hits` null so each list degrades to
 * whatever it can still match without the server, and records `error` so the
 * surface can say which half of the answer is missing. This is the rule
 * chat-core's store already shipped (`endContentSearch` / `contentSearchError`);
 * bridge-ui is the copy that never got it.
 *
 * `apiFetch` and `basePath` are arguments rather than context reads because the
 * two callers get them from different places — the Sessions page from
 * `useBridgeConfig()`, the chat sidebar from its own props.
 */
export declare function useSessionContentSearch(query: string, apiFetch: FetchFn, basePath: string): SessionContentSearch;
/** The half of the search state that a settled request replaces. */
export type SettledSessionContentSearch = Pick<SessionContentSearch, 'hits' | 'error'>;
/**
 * What a successful response leaves behind.
 *
 * Clearing the error is not redundant with clearing it when the search starts:
 * one query can have two requests out at once, so if the first fails while the
 * second succeeds, this is the only thing that takes the notice back down.
 */
export declare function sessionContentSearchAfterResponse(payload: unknown): SettledSessionContentSearch;
/**
 * What a failed request leaves behind.
 *
 * `hits` is null, NOT an empty map. This one line is the whole defect: an empty
 * map is the wire-identical shape of "your words appear in no transcript", so
 * returning one for a 502 turns a dead log-store into a confident negative and
 * the caller has no way to tell them apart.
 */
export declare function sessionContentSearchAfterFailure(reason: unknown): SettledSessionContentSearch;
/**
 * What a list built from this search is actually matching on right now.
 *
 * Both surfaces render their status text from this instead of each re-deriving
 * it from the (hits, searching, error) triple. Re-deriving it is where the
 * original bug lived: two places independently decided that "no hits" was the
 * whole story, and neither had a case for "the question was never answered".
 */
export type SessionContentSearchReach = 
/** No query typed. Nothing is filtered by content. */
'idle'
/** A request is debouncing or outstanding. Any count on screen is a floor. */
 | 'searching'
/** Hits are live. Transcript matches are included in the list. */
 | 'transcripts-included'
/** The search failed. NO transcript matching happened — say so. */
 | 'transcripts-unavailable';
export declare function sessionContentSearchReachOf(query: string, search: SessionContentSearch): SessionContentSearchReach;
/**
 * Reads the endpoint's array into match counts by session id. A row missing
 * `match_count` still counts as a hit — the session id is what the filters read,
 * and the count is only ever displayed.
 */
export declare function sessionContentSearchHitsFromPayload(payload: unknown): SessionContentSearchHits;
//# sourceMappingURL=useSessionContentSearch.d.ts.map