import { useEffect, useState } from 'react';
/** How long the query sits still before the request leaves. */
export const SESSION_CONTENT_SEARCH_DEBOUNCE_MS = 300;
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
export function useSessionContentSearch(query, apiFetch, basePath) {
    const [hits, setHits] = useState(null);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!query) {
            setHits(null);
            setSearching(false);
            setError(null);
            return;
        }
        let cancelled = false;
        const settle = (settled) => {
            setHits(settled.hits);
            setError(settled.error);
        };
        setSearching(true);
        const timer = setTimeout(() => {
            apiFetch(`${basePath}/sessions/search?q=${encodeURIComponent(query)}`)
                .then(async (response) => {
                if (!response.ok)
                    throw new Error(`search failed: ${response.status}`);
                const payload = (await response.json()) ?? [];
                if (cancelled)
                    return;
                settle(sessionContentSearchAfterResponse(payload));
            })
                .catch((reason) => {
                if (cancelled)
                    return;
                settle(sessionContentSearchAfterFailure(reason));
            })
                .finally(() => { if (!cancelled)
                setSearching(false); });
        }, SESSION_CONTENT_SEARCH_DEBOUNCE_MS);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, apiFetch, basePath]);
    return { hits, searching, error };
}
/**
 * What a successful response leaves behind.
 *
 * Clearing the error is not redundant with clearing it when the search starts:
 * one query can have two requests out at once, so if the first fails while the
 * second succeeds, this is the only thing that takes the notice back down.
 */
export function sessionContentSearchAfterResponse(payload) {
    return { hits: sessionContentSearchHitsFromPayload(payload), error: null };
}
/**
 * What a failed request leaves behind.
 *
 * `hits` is null, NOT an empty map. This one line is the whole defect: an empty
 * map is the wire-identical shape of "your words appear in no transcript", so
 * returning one for a 502 turns a dead log-store into a confident negative and
 * the caller has no way to tell them apart.
 */
export function sessionContentSearchAfterFailure(reason) {
    return { hits: null, error: reason instanceof Error ? reason.message : String(reason) };
}
export function sessionContentSearchReachOf(query, search) {
    if (!query)
        return 'idle';
    if (search.searching)
        return 'searching';
    // The error is checked before the hits: a query whose latest request failed
    // has no transcript half, whatever a previous query left behind.
    if (search.error)
        return 'transcripts-unavailable';
    return search.hits ? 'transcripts-included' : 'idle';
}
/**
 * Reads the endpoint's array into match counts by session id. A row missing
 * `match_count` still counts as a hit — the session id is what the filters read,
 * and the count is only ever displayed.
 */
export function sessionContentSearchHitsFromPayload(payload) {
    const hits = new Map();
    if (!Array.isArray(payload))
        return hits;
    for (const row of payload) {
        if (!row || typeof row !== 'object')
            continue;
        const sessionID = row.session_id;
        if (typeof sessionID !== 'string' || !sessionID)
            continue;
        const matchCount = row.match_count;
        hits.set(sessionID, typeof matchCount === 'number' ? matchCount : 0);
    }
    return hits;
}
//# sourceMappingURL=useSessionContentSearch.js.map