import type { FetchFn } from './types';
import type { GroupMembership, Principal, PrincipalDetail, PrincipalKind } from './types-principals';
import type { PrincipalKindFilter } from './usePrincipals';
export type PrincipalStoreResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
};
export declare function principalStoreErrorText(res: Response, verb: string): Promise<string>;
export interface PrincipalsSearch {
    /** Prefix search over display name and email (`q`). Empty lists everyone. */
    query: string;
    kind: PrincipalKindFilter;
    /** Whether disabled principals are in the answer. principal-store hides
     *  them unless asked, so the default listing is the active roster. */
    includeDisabled: boolean;
    limit: number;
}
/** How many rows one listing asks for; the same cap the shared directory reads. */
export declare const PRINCIPALS_SEARCH_LIMIT = 500;
/** The listing URL for a search. `include_disabled` is only sent when true, so
 *  the default request is the store's default answer — active principals. */
export declare function principalsSearchURL(principalStoreBasePath: string, search: PrincipalsSearch): string;
export declare function listPrincipalKinds(fetchFn: FetchFn, base: string): Promise<PrincipalStoreResult<PrincipalKind[]>>;
export declare function searchPrincipals(fetchFn: FetchFn, base: string, search: PrincipalsSearch): Promise<PrincipalStoreResult<Principal[]>>;
/** One principal with its memberships. Disabled members and groups are asked
 *  for on purpose: this is the editor, and a membership that still exists in
 *  the table should be on screen (flagged) rather than hidden by a default
 *  meant for pickers. */
export declare function getPrincipal(fetchFn: FetchFn, base: string, id: string): Promise<PrincipalStoreResult<PrincipalDetail>>;
export interface CreatePrincipalRequest {
    kind: PrincipalKind;
    display_name: string;
    email?: string;
}
export declare function createPrincipal(fetchFn: FetchFn, base: string, body: CreatePrincipalRequest): Promise<PrincipalStoreResult<Principal>>;
export interface PatchPrincipalRequest {
    display_name?: string;
    email?: string;
}
export declare function patchPrincipal(fetchFn: FetchFn, base: string, id: string, patch: PatchPrincipalRequest): Promise<PrincipalStoreResult<Principal>>;
/** `POST /principals/{id}/disable` or `/enable`. Both are idempotent on the
 *  server, so a double click is not an error. */
export declare function setPrincipalDisabled(fetchFn: FetchFn, base: string, id: string, disabled: boolean): Promise<PrincipalStoreResult<Principal>>;
export declare function addGroupMember(fetchFn: FetchFn, base: string, groupID: string, memberID: string): Promise<PrincipalStoreResult<GroupMembership>>;
export declare function removeGroupMember(fetchFn: FetchFn, base: string, groupID: string, memberID: string): Promise<PrincipalStoreResult<void>>;
//# sourceMappingURL=principalStoreClient.d.ts.map