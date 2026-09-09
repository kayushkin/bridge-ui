import type { PatchPrincipalRequest, PrincipalStoreResult } from '../principalStoreClient';
import type { Principal, PrincipalDetail, PrincipalKind } from '../types-principals';
/**
 * Top-level Principals page: the editor for principal-store's directory of the
 * humans and groups a card can be assigned to (and, later, a permission
 * granted to).
 *
 * Left, the roster: the store's own prefix search, a kind filter and a "show
 * disabled" toggle, plus the form that creates a principal. Right, the one
 * selected: its id in monospace so it can be pasted into a chat, its editable
 * name and email, its disabled state, and its memberships — a human's groups
 * or a group's members — each removable, with a picker to add one.
 *
 * Every mutation goes to the store and the affected views are re-read from it;
 * nothing here is updated optimistically, because the store is the source of
 * truth and its refusals are the interesting part. A refusal is shown in place,
 * in the server's own words: principal-store's 400s name the vocabulary, the
 * PATCH key it will not take, or that a group cannot be a member of a group.
 *
 * Renders nothing when the host passed no `principalStoreBasePath`, which is
 * also when `BridgeLayout` shows no Principals tab.
 */
export declare function BridgePrincipals(): import("react/jsx-runtime").JSX.Element | null;
export interface PrincipalListViewProps {
    principals: Principal[];
    selectedID: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
    /** The last read's failure. Shown beside whatever list is on screen; the
     *  list is not blanked, because "nobody" and "unknown" are different. */
    error: string | null;
}
/** The roster rows. Whether disabled principals are in `principals` is the
 *  server's decision (`include_disabled`); this only renders what it was
 *  given and flags the disabled ones. */
export declare function PrincipalListView({ principals, selectedID, onSelect, loading, error }: PrincipalListViewProps): import("react/jsx-runtime").JSX.Element;
export interface PrincipalDetailViewProps {
    detail: PrincipalDetail;
    /** A re-read is in flight. The old detail stays on screen meanwhile. */
    loading: boolean;
    /** The last re-read's failure, if the detail on screen may be stale. */
    readError: string | null;
    save: (patch: PatchPrincipalRequest) => Promise<PrincipalStoreResult<Principal>>;
    setDisabled: (disabled: boolean) => Promise<PrincipalStoreResult<Principal>>;
    addMembership: (groupID: string, memberID: string) => Promise<PrincipalStoreResult<unknown>>;
    removeMembership: (groupID: string, memberID: string) => Promise<PrincipalStoreResult<unknown>>;
    /** The store's prefix search, narrowed to one kind, for the pickers. */
    searchCandidates: (query: string, kind: PrincipalKind) => Promise<PrincipalStoreResult<Principal[]>>;
    /** Called after any successful write; the host re-reads what it shows. */
    onChanged: () => Promise<void>;
    /** Open another principal — a member or a group named in this one's lists. */
    onOpen: (id: string) => void;
}
export declare function PrincipalDetailView({ detail, loading, readError, save, setDisabled, addMembership, removeMembership, searchCandidates, onChanged, onOpen, }: PrincipalDetailViewProps): import("react/jsx-runtime").JSX.Element;
export interface MembershipsSectionProps {
    title: string;
    emptyText: string;
    /** A group's members, or a human's groups — whichever this principal has. */
    entries: Principal[];
    /** What the picker offers: humans for a group's member list, groups for a
     *  human's group list. */
    pickerKind: PrincipalKind;
    pickerPlaceholder: string;
    /** The open principal, never offered to itself. */
    selfID: string;
    add: (otherID: string) => Promise<PrincipalStoreResult<unknown>>;
    remove: (otherID: string) => Promise<PrincipalStoreResult<unknown>>;
    searchCandidates: (query: string, kind: PrincipalKind) => Promise<PrincipalStoreResult<Principal[]>>;
    onChanged: () => Promise<void>;
    onOpen: (id: string) => void;
    /** A refusal to show on first render. The section owns the live one; this
     *  seeds it, so a static render can show what a 400 looks like here. */
    initialError?: string | null;
}
export declare function MembershipsSection({ title, emptyText, entries, pickerKind, pickerPlaceholder, selfID, add, remove, searchCandidates, onChanged, onOpen, initialError, }: MembershipsSectionProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BridgePrincipals.d.ts.map