export async function principalStoreErrorText(res, verb) {
    const text = await res.text().catch(() => '');
    if (text) {
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed?.error === 'string' && parsed.error)
                return parsed.error;
        }
        catch {
            // Not JSON; the raw text is the message.
        }
        return text;
    }
    return `${verb} HTTP ${res.status}`;
}
async function request(fetchFn, verb, url, init) {
    let res;
    try {
        res = await fetchFn(url, init);
    }
    catch (err) {
        return { ok: false, error: `${verb}: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!res.ok)
        return { ok: false, error: await principalStoreErrorText(res, verb) };
    if (res.status === 204)
        return { ok: true, value: undefined };
    try {
        return { ok: true, value: (await res.json()) };
    }
    catch (err) {
        return { ok: false, error: `${verb}: response was not JSON (${err instanceof Error ? err.message : String(err)})` };
    }
}
const jsonInit = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});
/** How many rows one listing asks for; the same cap the shared directory reads. */
export const PRINCIPALS_SEARCH_LIMIT = 500;
/** The listing URL for a search. `include_disabled` is only sent when true, so
 *  the default request is the store's default answer — active principals. */
export function principalsSearchURL(principalStoreBasePath, search) {
    const params = new URLSearchParams();
    const q = search.query.trim();
    if (q)
        params.set('q', q);
    if (search.kind !== 'all')
        params.set('kind', search.kind);
    if (search.includeDisabled)
        params.set('include_disabled', 'true');
    params.set('limit', String(search.limit));
    return `${principalStoreBasePath}/principals?${params.toString()}`;
}
export function listPrincipalKinds(fetchFn, base) {
    return request(fetchFn, 'list kinds', `${base}/kinds`);
}
export async function searchPrincipals(fetchFn, base, search) {
    const result = await request(fetchFn, 'list principals', principalsSearchURL(base, search));
    // A JSON `null` body is how a Go handler encodes an empty slice it never
    // allocated; it means nobody matched, not that the listing is unknown.
    return result.ok ? { ok: true, value: result.value ?? [] } : result;
}
/** One principal with its memberships. Disabled members and groups are asked
 *  for on purpose: this is the editor, and a membership that still exists in
 *  the table should be on screen (flagged) rather than hidden by a default
 *  meant for pickers. */
export function getPrincipal(fetchFn, base, id) {
    return request(fetchFn, 'read principal', `${base}/principals/${encodeURIComponent(id)}?include_disabled=true`);
}
export function createPrincipal(fetchFn, base, body) {
    return request(fetchFn, 'create principal', `${base}/principals`, jsonInit('POST', body));
}
export function patchPrincipal(fetchFn, base, id, patch) {
    return request(fetchFn, 'update principal', `${base}/principals/${encodeURIComponent(id)}`, jsonInit('PATCH', patch));
}
/** `POST /principals/{id}/disable` or `/enable`. Both are idempotent on the
 *  server, so a double click is not an error. */
export function setPrincipalDisabled(fetchFn, base, id, disabled) {
    const verb = disabled ? 'disable' : 'enable';
    return request(fetchFn, `${verb} principal`, `${base}/principals/${encodeURIComponent(id)}/${verb}`, { method: 'POST' });
}
export function addGroupMember(fetchFn, base, groupID, memberID) {
    return request(fetchFn, 'add member', `${base}/principals/${encodeURIComponent(groupID)}/members/${encodeURIComponent(memberID)}`, { method: 'PUT' });
}
export function removeGroupMember(fetchFn, base, groupID, memberID) {
    return request(fetchFn, 'remove member', `${base}/principals/${encodeURIComponent(groupID)}/members/${encodeURIComponent(memberID)}`, { method: 'DELETE' });
}
//# sourceMappingURL=principalStoreClient.js.map