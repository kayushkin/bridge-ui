import type { Principal, PrincipalKind } from './types-principals';
export declare const PRINCIPALS_REFRESH_INTERVAL_MS: number;
/** How many principals one read asks for. principal-store caps a page at this;
 *  a directory larger than it would need paging, which nothing here does yet. */
export declare const PRINCIPALS_PAGE_LIMIT = 500;
export declare function principalsListURL(principalStoreBasePath: string): string;
export declare function principalIsDisabled(principal: Principal): boolean;
export declare function indexPrincipalsByID(list: Principal[]): Map<string, Principal>;
/** The initials an avatar chip shows for a human: the first letter of the first
 *  two words of the display name. "Vlad Kayushkin" → "VK", "Priya" → "P". */
export declare function principalInitials(displayName: string): string;
export type PrincipalKindFilter = 'all' | PrincipalKind;
export interface PickablePrincipalsFilter {
    /** Case-insensitive substring of `display_name`. Empty matches everyone. */
    query: string;
    kind: PrincipalKindFilter;
    /** Ids to leave out — the card's current assignees, so the picker never
     *  offers someone who is already on the card. */
    excludeIDs: Iterable<string>;
}
/** The principals a picker may offer. Disabled principals are never offered:
 *  they stay in the directory so existing assignments resolve, but assigning
 *  work to someone who left is the thing kanban-store's 400 exists to refuse,
 *  and a picker should not present a choice the server will reject. */
export declare function pickablePrincipals(list: Principal[], filter: PickablePrincipalsFilter): Principal[];
export interface PrincipalsDirectory {
    /** False when the host passed no `principalStoreBasePath`. Everything that
     *  renders an assignee hides itself on false; nothing was fetched. */
    enabled: boolean;
    /** Every principal, disabled ones included, by id. */
    byId: Map<string, Principal>;
    /** Every principal, disabled ones included. Filter through
     *  `pickablePrincipals` before offering any of them. */
    list: Principal[];
    /** True until the first attempt has settled, one way or the other. */
    loading: boolean;
    /** The last load's failure, e.g. `HTTP 502`. Set while `list` is empty means
     *  the directory is UNKNOWN, not empty — render the error, never "nobody". A
     *  later failure keeps the last good list and sets this beside it. */
    error: string | null;
    refresh: () => Promise<void>;
}
/**
 * usePrincipals — the shared principal directory, for resolving assignee ids
 * to people and for the assignee picker.
 */
export declare function usePrincipals(): PrincipalsDirectory;
//# sourceMappingURL=usePrincipals.d.ts.map