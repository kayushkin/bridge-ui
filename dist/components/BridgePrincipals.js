import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from '../context';
import { PRINCIPALS_SEARCH_LIMIT, addGroupMember, createPrincipal, getPrincipal, listPrincipalKinds, patchPrincipal, removeGroupMember, searchPrincipals, setPrincipalDisabled, } from '../principalStoreClient';
import { pickablePrincipals, principalInitials, principalIsDisabled } from '../usePrincipals';
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
export function BridgePrincipals() {
    const { fetch: fetchFn, principalStoreBasePath } = useBridgeConfig();
    if (!principalStoreBasePath)
        return null;
    return _jsx(PrincipalsPage, { fetchFn: fetchFn, base: principalStoreBasePath });
}
const KIND_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'human', label: 'People' },
    { value: 'group', label: 'Groups' },
];
/** A human-readable label for a kind, for badges and the create form. The
 *  vocabulary itself comes from `GET /kinds`; only the wording is here, and an
 *  unknown kind is shown as the kind's own name rather than dropped. */
function kindLabel(kind) {
    if (kind === 'human')
        return 'Person';
    if (kind === 'group')
        return 'Group';
    return kind;
}
function PrincipalsPage({ fetchFn, base }) {
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('all');
    const [showDisabled, setShowDisabled] = useState(false);
    const [list, setList] = useState([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState(null);
    const [kinds, setKinds] = useState([]);
    const [kindsError, setKindsError] = useState(null);
    const [selectedID, setSelectedID] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    // Reads race: a slow answer to "pri" must not land after the answer to
    // "priya". Each read takes a ticket and only the latest one may set state.
    const listTicket = useRef(0);
    const detailTicket = useRef(0);
    const search = useMemo(() => ({ query, kind, includeDisabled: showDisabled, limit: PRINCIPALS_SEARCH_LIMIT }), [query, kind, showDisabled]);
    const loadList = useCallback(async () => {
        const ticket = ++listTicket.current;
        setListLoading(true);
        const result = await searchPrincipals(fetchFn, base, search);
        if (ticket !== listTicket.current)
            return;
        if (result.ok) {
            setList(result.value);
            setListError(null);
        }
        else {
            // The last good list stays on screen beside the error; an empty list
            // would say "nobody matched" when the truth is "the store did not answer".
            setListError(result.error);
        }
        setListLoading(false);
    }, [fetchFn, base, search]);
    const loadDetail = useCallback(async (id) => {
        const ticket = ++detailTicket.current;
        setDetailLoading(true);
        const result = await getPrincipal(fetchFn, base, id);
        if (ticket !== detailTicket.current)
            return;
        if (result.ok) {
            setDetail(result.value);
            setDetailError(null);
        }
        else {
            setDetailError(result.error);
        }
        setDetailLoading(false);
    }, [fetchFn, base]);
    useEffect(() => { void loadList(); }, [loadList]);
    useEffect(() => {
        listPrincipalKinds(fetchFn, base).then(result => {
            if (result.ok) {
                setKinds(result.value);
                setKindsError(null);
            }
            else
                setKindsError(result.error);
        });
    }, [fetchFn, base]);
    useEffect(() => {
        if (!selectedID) {
            setDetail(null);
            setDetailError(null);
            return;
        }
        void loadDetail(selectedID);
    }, [selectedID, loadDetail]);
    // After a write, re-read the roster and the open principal. Both, always:
    // a rename shows in the list, a disable moves the row out of the default
    // listing, a membership shows on the group AND on the human.
    const reloadAfterMutation = useCallback(async () => {
        await Promise.all([loadList(), selectedID ? loadDetail(selectedID) : Promise.resolve()]);
    }, [loadList, loadDetail, selectedID]);
    const onCreated = useCallback((created) => {
        // Clear the filters so the new row is in the listing it lands in, then
        // open it. A group created under the People filter would otherwise be
        // selected and invisible at once.
        setQuery('');
        setKind('all');
        setSelectedID(created.id);
    }, []);
    const searchCandidates = useCallback((candidateQuery, candidateKind) => searchPrincipals(fetchFn, base, { query: candidateQuery, kind: candidateKind, includeDisabled: false, limit: PRINCIPALS_SEARCH_LIMIT }), [fetchFn, base]);
    return (_jsxs("div", { className: "bp-container", children: [_jsxs("div", { className: "bp-header", children: [_jsx("h2", { className: "bp-title", children: "Principals" }), _jsx("p", { className: "bp-subtitle", children: "The people and groups work can be assigned to. Ids are the join key everywhere else; names are for display." })] }), _jsxs("div", { className: "bp-columns", children: [_jsxs("section", { className: "bp-list-pane", "aria-label": "Principals", children: [_jsxs("div", { className: "bp-toolbar", children: [_jsx("input", { type: "search", className: "bp-search", placeholder: "Search by name or email\u2026", value: query, onChange: e => setQuery(e.target.value), "aria-label": "Search principals" }), _jsx("div", { className: "bp-kinds", role: "group", "aria-label": "Principal kind", children: KIND_FILTERS.map(k => (_jsx("button", { type: "button", className: "bp-kind", "aria-pressed": kind === k.value, onClick: () => setKind(k.value), children: k.label }, k.value))) }), _jsxs("label", { className: "bp-check", children: [_jsx("input", { type: "checkbox", checked: showDisabled, onChange: e => setShowDisabled(e.target.checked) }), _jsx("span", { children: "Show disabled" })] })] }), _jsx(PrincipalCreateForm, { kinds: kinds, kindsError: kindsError, create: body => createPrincipal(fetchFn, base, body), onCreated: async (created) => { onCreated(created); await loadList(); } }), _jsx(PrincipalListView, { principals: list, selectedID: selectedID, onSelect: setSelectedID, loading: listLoading, error: listError })] }), _jsx("section", { className: "bp-detail-pane", "aria-label": "Selected principal", children: !selectedID ? (_jsx("div", { className: "bp-empty", children: "Select a principal to see its details." })) : detailError && !detail ? (_jsx("div", { className: "bridge-error bp-error", children: detailError })) : !detail ? (_jsx("div", { className: "bp-empty", children: "Loading\u2026" })) : (_jsx(PrincipalDetailView, { detail: detail, loading: detailLoading, readError: detailError, save: patch => patchPrincipal(fetchFn, base, detail.id, patch), setDisabled: disabled => setPrincipalDisabled(fetchFn, base, detail.id, disabled), addMembership: (groupID, memberID) => addGroupMember(fetchFn, base, groupID, memberID), removeMembership: (groupID, memberID) => removeGroupMember(fetchFn, base, groupID, memberID), searchCandidates: searchCandidates, onChanged: reloadAfterMutation, onOpen: setSelectedID })) })] })] }));
}
/** The roster rows. Whether disabled principals are in `principals` is the
 *  server's decision (`include_disabled`); this only renders what it was
 *  given and flags the disabled ones. */
export function PrincipalListView({ principals, selectedID, onSelect, loading, error }) {
    return (_jsxs("div", { className: "bp-list-wrap", children: [error && _jsxs("div", { className: "bridge-error bp-error", children: ["Could not list principals: ", error] }), loading && principals.length === 0 && !error && _jsx("div", { className: "bp-empty", children: "Loading\u2026" }), !loading && principals.length === 0 && !error && _jsx("div", { className: "bp-empty", children: "No principals match." }), principals.length > 0 && (_jsx("ul", { className: "bp-list", "aria-busy": loading, children: principals.map(p => (_jsx("li", { children: _jsxs("button", { type: "button", className: `bp-row${p.id === selectedID ? ' bp-row-selected' : ''}${principalIsDisabled(p) ? ' bp-row-disabled' : ''}`, "data-principal-id": p.id, "aria-pressed": p.id === selectedID, onClick: () => onSelect(p.id), children: [_jsx(PrincipalAvatar, { principal: p }), _jsxs("span", { className: "bp-row-text", children: [_jsx("span", { className: "bp-row-name", children: p.display_name }), p.email && _jsx("span", { className: "bp-row-email", children: p.email })] }), principalIsDisabled(p) && _jsx("span", { className: "bp-badge bp-badge-disabled", children: "disabled" })] }) }, p.id))) }))] }));
}
/** The initials avatar for a person, the group glyph for a group — the same
 *  vocabulary the kanban tiles use, so a face here is the face on the card. */
function PrincipalAvatar({ principal, large = false }) {
    const className = `bp-avatar bp-avatar-${principal.kind}${large ? ' bp-avatar-large' : ''}`;
    if (principal.kind === 'group') {
        return _jsx("span", { className: className, "aria-hidden": "true", children: "\uD83D\uDC65" });
    }
    return _jsx("span", { className: className, "aria-hidden": "true", children: principalInitials(principal.display_name) });
}
function PrincipalCreateForm({ kinds, kindsError, create, onCreated }) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // The kind defaults to the first the store names once it has answered, and
    // to nothing before: a form that assumed "human" would be wrong on the day
    // the vocabulary changes, which is what `/kinds` exists to prevent.
    const effectiveKind = kind || kinds[0] || '';
    const submit = async (e) => {
        e.preventDefault();
        if (!effectiveKind || !displayName.trim())
            return;
        setBusy(true);
        setError(null);
        const body = {
            kind: effectiveKind,
            display_name: displayName.trim(),
        };
        if (effectiveKind === 'human' && email.trim())
            body.email = email.trim();
        const result = await create(body);
        if (result.ok) {
            setDisplayName('');
            setEmail('');
            setOpen(false);
            await onCreated(result.value);
        }
        else {
            setError(result.error);
        }
        setBusy(false);
    };
    if (!open) {
        return (_jsx("div", { className: "bp-create-toggle", children: _jsx("button", { type: "button", className: "bi-add-btn", onClick: () => setOpen(true), children: "+ New principal" }) }));
    }
    return (_jsxs("form", { className: "bp-create", onSubmit: submit, children: [_jsxs("div", { className: "bp-create-row", children: [_jsxs("select", { className: "bp-create-kind", value: effectiveKind, onChange: e => setKind(e.target.value), "aria-label": "Kind", disabled: kinds.length === 0, children: [kinds.length === 0 && _jsx("option", { value: "", children: kindsError ? 'kinds unavailable' : 'loading kinds…' }), kinds.map(k => _jsx("option", { value: k, children: kindLabel(k) }, k))] }), _jsx("input", { className: "bp-create-name", placeholder: "Display name", value: displayName, onChange: e => setDisplayName(e.target.value), "aria-label": "Display name", required: true })] }), effectiveKind === 'human' && (_jsx("input", { className: "bp-create-email", type: "email", placeholder: "Email (optional)", value: email, onChange: e => setEmail(e.target.value), "aria-label": "Email" })), kindsError && _jsxs("div", { className: "bridge-error bp-error", children: ["Could not load kinds: ", kindsError] }), error && _jsx("div", { className: "bridge-error bp-error", children: error }), _jsxs("div", { className: "bp-create-actions", children: [_jsx("button", { type: "submit", className: "bi-save-btn", disabled: busy || !effectiveKind || !displayName.trim(), children: busy ? 'Creating…' : 'Create' }), _jsx("button", { type: "button", className: "bp-cancel", onClick: () => { setOpen(false); setError(null); }, children: "Cancel" })] })] }));
}
export function PrincipalDetailView({ detail, loading, readError, save, setDisabled, addMembership, removeMembership, searchCandidates, onChanged, onOpen, }) {
    const disabled = principalIsDisabled(detail);
    const [statusBusy, setStatusBusy] = useState(false);
    const [statusError, setStatusError] = useState(null);
    const toggleDisabled = async () => {
        setStatusBusy(true);
        setStatusError(null);
        const result = await setDisabled(!disabled);
        if (result.ok)
            await onChanged();
        else
            setStatusError(result.error);
        setStatusBusy(false);
    };
    const isGroup = detail.kind === 'group';
    return (_jsxs("div", { className: `bp-detail${disabled ? ' bp-detail-disabled' : ''}`, "data-principal-id": detail.id, "aria-busy": loading, children: [_jsxs("header", { className: "bp-detail-head", children: [_jsx(PrincipalAvatar, { principal: detail, large: true }), _jsxs("div", { className: "bp-detail-title", children: [_jsx("h3", { className: "bp-detail-name", children: detail.display_name }), _jsxs("div", { className: "bp-detail-meta", children: [_jsx("span", { className: `bp-badge bp-badge-${detail.kind}`, children: kindLabel(detail.kind) }), _jsx("code", { className: "bp-id", title: "The id other stores join on", children: detail.id }), disabled && _jsx("span", { className: "bp-badge bp-badge-disabled", children: "disabled" })] })] })] }), readError && _jsxs("div", { className: "bridge-error bp-error", children: ["Could not re-read this principal: ", readError] }), _jsxs("section", { className: "bp-section", children: [_jsx("h4", { className: "bp-section-title", children: "Details" }), _jsx(PrincipalEditForm, { detail: detail, save: save, onSaved: onChanged }, `${detail.id}:${detail.updated_at}`)] }), _jsxs("section", { className: "bp-section", children: [_jsx("h4", { className: "bp-section-title", children: "Status" }), _jsxs("div", { className: "bp-status-row", children: [_jsx("span", { className: `bp-status ${disabled ? 'bp-status-disabled' : 'bp-status-active'}`, children: disabled ? `Disabled since ${formatEpochSeconds(detail.disabled_at)}` : 'Active' }), _jsx("button", { type: "button", className: disabled ? 'bi-save-btn' : 'bp-danger-btn', onClick: () => { void toggleDisabled(); }, disabled: statusBusy, children: statusBusy ? '…' : disabled ? 'Enable' : 'Disable' })] }), _jsx("p", { className: "bp-hint", children: isGroup
                            ? 'A disabled group keeps its members and its assignments, but is not offered for new ones. There is no delete.'
                            : 'A disabled person keeps their assignments, shown struck through, but is not offered for new ones. There is no delete.' }), statusError && _jsx("div", { className: "bridge-error bp-error", children: statusError })] }), isGroup ? (_jsx(MembershipsSection, { title: "Members", emptyText: "No members yet.", entries: detail.members ?? [], pickerKind: "human", pickerPlaceholder: "Add a person\u2026", selfID: detail.id, add: memberID => addMembership(detail.id, memberID), remove: memberID => removeMembership(detail.id, memberID), searchCandidates: searchCandidates, onChanged: onChanged, onOpen: onOpen }, `members:${detail.id}`)) : (_jsx(MembershipsSection, { title: "Groups", emptyText: "In no groups.", entries: detail.groups ?? [], pickerKind: "group", pickerPlaceholder: "Add to a group\u2026", selfID: detail.id, add: groupID => addMembership(groupID, detail.id), remove: groupID => removeMembership(groupID, detail.id), searchCandidates: searchCandidates, onChanged: onChanged, onOpen: onOpen }, `groups:${detail.id}`))] }));
}
function formatEpochSeconds(seconds) {
    return new Date(seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function PrincipalEditForm({ detail, save, onSaved, }) {
    const [displayName, setDisplayName] = useState(detail.display_name);
    const [email, setEmail] = useState(detail.email);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // Only what changed goes in the PATCH. principal-store takes exactly two
    // keys and refuses any other, and sending an unchanged name alongside a
    // changed email would be a write it does not need.
    const patch = {};
    if (displayName.trim() !== detail.display_name)
        patch.display_name = displayName.trim();
    if (detail.kind === 'human' && email.trim() !== detail.email)
        patch.email = email.trim();
    const dirty = Object.keys(patch).length > 0;
    const submit = async (e) => {
        e.preventDefault();
        if (!dirty || !displayName.trim())
            return;
        setBusy(true);
        setError(null);
        const result = await save(patch);
        if (result.ok)
            await onSaved();
        else
            setError(result.error);
        setBusy(false);
    };
    return (_jsxs("form", { className: "bp-edit", onSubmit: submit, children: [_jsxs("label", { className: "bp-field", children: [_jsx("span", { className: "bp-field-label", children: "Display name" }), _jsx("input", { className: "bp-input", value: displayName, onChange: e => setDisplayName(e.target.value), required: true })] }), detail.kind === 'human' && (_jsxs("label", { className: "bp-field", children: [_jsx("span", { className: "bp-field-label", children: "Email" }), _jsx("input", { className: "bp-input", type: "email", value: email, onChange: e => setEmail(e.target.value) })] })), error && _jsx("div", { className: "bridge-error bp-error", children: error }), _jsxs("div", { className: "bp-edit-actions", children: [_jsx("button", { type: "submit", className: "bi-save-btn", disabled: !dirty || busy || !displayName.trim(), children: busy ? 'Saving…' : 'Save' }), dirty && !busy && (_jsx("button", { type: "button", className: "bp-cancel", onClick: () => { setDisplayName(detail.display_name); setEmail(detail.email); }, children: "Revert" }))] })] }));
}
export function MembershipsSection({ title, emptyText, entries, pickerKind, pickerPlaceholder, selfID, add, remove, searchCandidates, onChanged, onOpen, initialError = null, }) {
    const [error, setError] = useState(initialError);
    const [busyID, setBusyID] = useState(null);
    const run = async (otherID, outcome) => {
        setBusyID(otherID);
        setError(null);
        const result = await outcome;
        if (result.ok)
            await onChanged();
        else
            setError(result.error);
        setBusyID(null);
        return result.ok;
    };
    const excludeIDs = useMemo(() => [selfID, ...entries.map(e => e.id)], [selfID, entries]);
    return (_jsxs("section", { className: "bp-section bp-memberships", children: [_jsxs("h4", { className: "bp-section-title", children: [title, " ", _jsx("span", { className: "bp-count", children: entries.length })] }), _jsxs("ul", { className: "bp-membership-list", children: [entries.map(entry => (_jsxs("li", { className: `bp-membership${principalIsDisabled(entry) ? ' bp-membership-disabled' : ''}`, "data-principal-id": entry.id, children: [_jsxs("button", { type: "button", className: "bp-membership-open", onClick: () => onOpen(entry.id), title: `Open ${entry.display_name}`, children: [_jsx(PrincipalAvatar, { principal: entry }), _jsx("span", { className: "bp-membership-name", children: entry.display_name }), entry.email && _jsx("span", { className: "bp-membership-email", children: entry.email }), principalIsDisabled(entry) && _jsx("span", { className: "bp-badge bp-badge-disabled", children: "disabled" })] }), _jsx("button", { type: "button", className: "bp-membership-remove", title: `Remove ${entry.display_name}`, "aria-label": `Remove ${entry.display_name}`, disabled: busyID !== null, onClick: () => { void run(entry.id, remove(entry.id)); }, children: "\u00D7" })] }, entry.id))), entries.length === 0 && _jsx("li", { className: "bp-empty-inline", children: emptyText })] }), error && _jsx("div", { className: "bridge-error bp-error bp-membership-error", children: error }), _jsx(PrincipalPicker, { kind: pickerKind, placeholder: pickerPlaceholder, excludeIDs: excludeIDs, search: searchCandidates, busy: busyID !== null, onPick: id => run(id, add(id)) })] }));
}
/** How many candidates the picker lists before asking for a narrower search. */
const PICKER_MATCHES_SHOWN = 30;
/**
 * A picker over the store's prefix search, narrowed to one kind. Whoever is
 * already in the list, the open principal itself, and anyone disabled are never
 * offered — `pickablePrincipals` is the same rule the kanban assignee picker
 * applies, so the two never disagree about who can be chosen.
 *
 * A search that failed renders the failure, not an empty list: an empty list
 * would claim there is nobody to add.
 */
function PrincipalPicker({ kind, placeholder, excludeIDs, search, busy, onPick, }) {
    const [query, setQuery] = useState('');
    const [candidates, setCandidates] = useState(null);
    const [error, setError] = useState(null);
    const ticket = useRef(0);
    useEffect(() => {
        const mine = ++ticket.current;
        search(query, kind).then(result => {
            if (mine !== ticket.current)
                return;
            if (result.ok) {
                setCandidates(result.value);
                setError(null);
            }
            else
                setError(result.error);
        });
    }, [query, kind, search]);
    // The server already applied the query (to name AND email, as a prefix), so
    // the client pass filters by exclusion only — re-applying the text here would
    // drop a match the store found by email.
    const matches = useMemo(() => candidates ? pickablePrincipals(candidates, { query: '', kind, excludeIDs }) : [], [candidates, kind, excludeIDs]);
    const shown = matches.slice(0, PICKER_MATCHES_SHOWN);
    return (_jsxs("div", { className: "bp-picker", "data-picker-kind": kind, children: [_jsx("input", { type: "search", className: "bp-picker-query", placeholder: placeholder, value: query, onChange: e => setQuery(e.target.value), "aria-label": placeholder }), error && _jsxs("div", { className: "bridge-error bp-error", children: ["Could not search principals: ", error] }), !error && candidates === null && _jsx("div", { className: "bp-empty-inline", children: "Loading\u2026" }), !error && candidates !== null && (_jsxs("ul", { className: "bp-picker-matches", children: [shown.map(p => (_jsx("li", { children: _jsxs("button", { type: "button", className: "bp-picker-match", "data-principal-id": p.id, disabled: busy, title: `Add ${p.display_name}`, onClick: () => { void onPick(p.id); }, children: [_jsx(PrincipalAvatar, { principal: p }), _jsx("span", { className: "bp-membership-name", children: p.display_name }), p.email && _jsx("span", { className: "bp-membership-email", children: p.email })] }) }, p.id))), shown.length === 0 && (_jsx("li", { className: "bp-empty-inline", children: candidates.length === 0
                            ? (query.trim() ? `No ${kind === 'group' ? 'groups' : 'people'} match “${query.trim()}”.` : `principal-store has no ${kind === 'group' ? 'groups' : 'people'}.`)
                            : `Every matching ${kind === 'group' ? 'group' : 'person'} is already here.` })), matches.length > shown.length && (_jsxs("li", { className: "bp-empty-inline", children: [matches.length - shown.length, " more \u2014 narrow the search."] }))] }))] }));
}
//# sourceMappingURL=BridgePrincipals.js.map