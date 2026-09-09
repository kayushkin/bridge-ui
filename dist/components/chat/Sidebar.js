import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VList } from 'virtua';
import { useSessionList, useActiveSession, usePrefetch, useFilters, useSessionActions, useFolders, useConnState, useSubagentSessions, isRunningState, ARCHIVE_FOLDER, } from '@kayushkin/chat-core';
import { useBridgeConfig } from '../../context';
import { useBridgeHarnesses } from '../../useBridgeHarnesses';
import { useBridgeInstances } from '../../useBridgeInstances';
import { useBridgeMachines } from '../../useBridgeMachines';
import { EditableName } from './EditableName';
import { ProducerRow } from './ProducerRow';
import { StatusDot } from './StatusDot';
import { isArchivedFolder } from './bridgeAdapters';
import { loadCollapsedFolders, loadFiltersOpen, saveCollapsedFolders, saveFiltersOpen, } from './sidebarPersistence';
import { FolderQuestionRollupMarker, SessionQuestionMarker } from './QuestionMarkers';
import { isSessionAwaitingHuman } from './sessionAwaitingHuman';
import { useSessionsWithOpenQuestion } from './sessionsWithOpenQuestion';
import NewSessionMenu from './NewSessionMenu';
import { useSelectSession } from './useSelectSession';
import SignalsInbox from './SignalsInbox';
import styles from './Chat.module.css';
/** The six multi-select axes chat-core's FilterState now supports. Each axis is a
 *  `string[]` (empty = no filter); `machine` matches SessionSummary.instanceId and is
 *  resolved to a machine display name/emoji for the label only (the filter value stays
 *  the instanceId). */
const AXES = ['harness', 'status', 'type', 'purpose', 'mode', 'machine'];
/** Toggle a value in/out of an axis's selection array. */
function toggle(arr, value) {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}
/** How close to the bottom of the scroller counts as "at the end", in CSS pixels.
 *  Roughly two session rows, so the next page starts landing before the user hits
 *  the floor rather than after. */
const NEAR_END_PX = 96;
/** Shortest gap between two AUTO-loaded pages, in milliseconds. Only throttles the
 *  scroll path; the button is a deliberate act and is never throttled. */
const AUTO_PAGE_COOLDOWN_MS = 1000;
export default function Sidebar({ newTarget, onToggleCollapse, onAfterSelect }) {
    const { groups, loading, effectiveState, facets, moreSessions, loadingOlderSessions, loadOlderSessions, } = useSessionList();
    // The durable half of "this session is waiting on you". Session state is the transient
    // half and cannot answer for a session that has since finished — see the hook.
    const { sessionIds: sessionsWithOpenQuestion } = useSessionsWithOpenQuestion();
    /** Whether a row should carry the `?`. A UNION, and both halves are load-bearing:
     *
     *   - an open QUESTION signal is durable and survives the session finishing, which is
     *     the case session state cannot see;
     *   - `awaiting_permission` mints no signal at all — only `AskUserQuestion` does
     *     (`recordAskUserQuestionSignals`) — so a plain tool approval is visible ONLY in the
     *     state, and dropping the state half would have traded one blind spot for another.
     *
     * `awaiting_user` overlaps both and is harmless in either. */
    const waitingOnHuman = useCallback((sessionId, state) => sessionsWithOpenQuestion.has(sessionId) || isSessionAwaitingHuman(state), [sessionsWithOpenQuestion]);
    const { id: activeId } = useActiveSession();
    // Not chat-core's bare `select`: opening a row also records the session as its
    // instance's last session, the same as the header's nav arrows. See `useSelectSession`.
    //
    // Wrapped ONCE here rather than at each row: every row already goes through this one
    // binding, so the drawer's close travels with the open by construction and a row added
    // later cannot forget it.
    const selectSession = useSelectSession();
    const select = useCallback((sessionId) => {
        selectSession(sessionId);
        onAfterSelect?.();
    }, [selectSession, onAfterSelect]);
    const prefetch = usePrefetch();
    const { filter, set, contentSearchReach, searching, searchError } = useFilters();
    const { newSession, archive, unarchive, rename, error: actionError } = useSessionActions();
    const { folders, createFolder, deleteFolder, renameFolder, moveSessionToFolder, error: folderError, } = useFolders();
    const { instanceMap } = useBridgeInstances();
    const { machineMap } = useBridgeMachines();
    const { harnessMap, basePath } = useBridgeHarnesses();
    // The Orchestrator row's two paths, both from the provider rather than literals:
    // `fetch` is the same credentialed fetch every other call on this page uses, and
    // an empty `producerBasePath` means this host proxies no producer, in which case
    // the row is not rendered at all rather than pointed at a guessed path.
    const { fetch: bridgeApiFetch, producerBasePath, routes } = useBridgeConfig();
    // Liveness of the session-list stream. `listLoading` only covers the FIRST fetch, so
    // without this an empty list after a dropped stream reads as "you have no sessions".
    // 'open' is the only state in which updates are flowing — see useConnState.
    const connState = useConnState();
    const connected = connState === 'open';
    // Both read back in the useState INITIALISER, so the sidebar's first paint already
    // has the folders the user collapsed folded away. Restoring them in an effect would
    // draw every folder open and then snap them shut a frame later, which reads as the
    // list jumping under the pointer. Same reasoning as chat-core's draft and filter
    // rehydrates — see sidebarPersistence.ts for why these are chat's own keys.
    const [filtersOpen, setFiltersOpen] = useState(loadFiltersOpen);
    const [collapsedFolders, setCollapsedFolders] = useState(loadCollapsedFolders);
    // Write on change rather than from inside the toggles. The collapse toggle is a
    // functional `setState` updater, and React may call one of those twice — a save in
    // there would be a side effect in a function that is meant to be pure. An effect
    // keyed on the value is idempotent and stays correct if a second control ever
    // collapses a folder.
    useEffect(() => {
        saveCollapsedFolders(collapsedFolders);
    }, [collapsedFolders]);
    useEffect(() => {
        saveFiltersOpen(filtersOpen);
    }, [filtersOpen]);
    const toggleFolderCollapsed = useCallback((folder) => {
        setCollapsedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folder))
                next.delete(folder);
            else
                next.add(folder);
            return next;
        });
    }, []);
    // Expand only — what the folder header's question rollup does. It is NOT the toggle
    // above: the rollup exists because collapsing hid the rows that carry the answerable
    // markers, so a rollup that could also collapse would hide the very thing it is
    // pointing at. Returning `prev` unchanged when the folder is already open keeps the
    // state identity stable, so nothing re-renders on a no-op.
    const expandFolder = useCallback((folder) => {
        setCollapsedFolders((prev) => {
            if (!prev.has(folder))
                return prev;
            const next = new Set(prev);
            next.delete(folder);
            return next;
        });
    }, []);
    const [newMenuOpen, setNewMenuOpen] = useState(false);
    const listRef = useRef(null);
    // Which row's question dropdown is open, by session id — null for none.
    //
    // Held HERE rather than inside each marker, and that is the whole of the "one open at a
    // time" rule: a marker cannot close a sibling it has never heard of, so the id lives
    // where every row can see it and opening one is what closes the other. It is also why
    // the rows stay cheap — see the `rows` memo below.
    const [openQuestionSessionId, setOpenQuestionSessionId] = useState(null);
    const toggleQuestionPanel = useCallback((sessionId) => {
        setOpenQuestionSessionId((current) => (current === sessionId ? null : sessionId));
    }, []);
    const closeQuestionPanel = useCallback(() => setOpenQuestionSessionId(null), []);
    // The row/folder context menu. One at a time, so opening a second closes the first.
    const [ctxMenu, setCtxMenu] = useState(null);
    // Which sub-form the open menu is showing, if any. Kept beside `ctxMenu` rather than
    // inside it so closing the menu clears both in one place.
    const [folderForm, setFolderForm] = useState(null);
    const [folderDraft, setFolderDraft] = useState('');
    const folderInputRef = useRef(null);
    const closeMenu = useCallback(() => {
        setCtxMenu(null);
        setFolderForm(null);
        setFolderDraft('');
    }, []);
    // Any click outside the menu dismisses it. The menu stops propagation on its own
    // clicks, so its buttons still fire; the listener is only mounted while a menu is
    // open, so the sidebar costs nothing the rest of the time. A right-click fires
    // `contextmenu`, not `click`, which is why opening a second menu from another row
    // does not immediately close it.
    useEffect(() => {
        if (!ctxMenu)
            return;
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [ctxMenu, closeMenu]);
    useEffect(() => {
        if (folderForm)
            folderInputRef.current?.focus();
    }, [folderForm]);
    const openSessionMenu = useCallback((e, sessionId) => {
        e.preventDefault();
        e.stopPropagation();
        setFolderForm(null);
        setFolderDraft('');
        setCtxMenu({ type: 'session', sessionId, x: e.clientX, y: e.clientY });
    }, []);
    const openFolderMenu = useCallback((e, folder) => {
        e.preventDefault();
        e.stopPropagation();
        // The unfoldered bucket is the ABSENCE of a folder, not a folder — there is
        // nothing to rename or delete, so it gets no menu at all.
        if (!folder)
            return;
        setFolderForm(null);
        setFolderDraft('');
        setCtxMenu({ type: 'folder', folder, x: e.clientX, y: e.clientY });
    }, []);
    // Every menu action closes the menu first and then mutates. The mutations are
    // void-returning and optimistic (chat-core reverts and reports through `error`), so
    // there is nothing to await and no reason to hold the menu open over the request.
    const submitFolderForm = useCallback(() => {
        const name = folderDraft.trim();
        if (!name || !ctxMenu)
            return;
        const target = ctxMenu;
        closeMenu();
        if (folderForm === 'rename') {
            if (target.type === 'folder')
                renameFolder(target.folder, name);
            return;
        }
        // "+ New folder" on a session row is ONE call: filing a session into a folder that
        // does not exist creates it in the same server transaction. On a folder header
        // there is no session to file, so the folder is created empty.
        if (target.type === 'session')
            moveSessionToFolder(target.sessionId, name);
        else
            createFolder(name);
    }, [folderDraft, folderForm, ctxMenu, closeMenu, renameFolder, moveSessionToFolder, createFolder]);
    // Infinite scroll: reaching the end of the loaded window pulls the next page. virtua
    // 0.44's VList has no onRangeChange, so the end is measured off the handle rather
    // than off a row index — which is the right measure anyway, since the rows are a
    // flattened mix of folder headers and sessions.
    //
    // chat-core refuses a second page while one is in flight, and that is NOT enough on
    // its own: each page that lands grows the scroller under a cursor still resting at
    // the bottom, so the browser fires another scroll, which pulls another page. Measured
    // in a browser, holding at the foot chain-loaded eleven pages — 1,100 sessions — in
    // 640ms, each with a valid distinct cursor. The whole point of paging is that the
    // client never holds the whole table, so the auto-load is rate-limited to one page
    // per second. The button below has no cooldown: a click is a request, a scroll that
    // the last page caused is not.
    const lastAutoPageAtRef = useRef(0);
    const onScroll = useCallback((offset) => {
        const handle = listRef.current;
        if (!handle || !moreSessions || loadingOlderSessions)
            return;
        if (handle.scrollSize - (offset + handle.viewportSize) >= NEAR_END_PX)
            return;
        const now = Date.now();
        if (now - lastAutoPageAtRef.current < AUTO_PAGE_COOLDOWN_MS)
            return;
        lastAutoPageAtRef.current = now;
        loadOlderSessions();
    }, [moreSessions, loadingOlderSessions, loadOlderSessions]);
    // instanceId → machine display {name, emoji}, resolved through the instance's
    // machine_id. Used for the machine chip labels and the per-row emoji. The FILTER
    // value stays the instanceId — this is presentation only.
    const machineDisplay = useCallback((instanceId) => {
        if (!instanceId)
            return undefined;
        const machineId = instanceMap.get(instanceId)?.machine_id;
        const m = machineId ? machineMap.get(machineId) : undefined;
        return { name: m?.name || instanceId, emoji: m?.emoji };
    }, [instanceMap, machineMap]);
    // Per-axis chip options with live counts, sourced from chat-core's cross-axis
    // `facets` (counts over the FULL loaded set, independent of the active filter —
    // fixes the Phase-1 "faceted-within-selection" limitation). The active selection is
    // always kept in the option set so it can be cleared even at count 0. The machine
    // axis's facet keys are instanceId values, resolved to a machine name/emoji label.
    const axisOptions = useMemo(() => {
        const out = {};
        for (const axis of AXES) {
            const counts = { ...facets[axis] };
            for (const sel of filter[axis])
                if (!(sel in counts))
                    counts[sel] = 0;
            const opts = Object.entries(counts).map(([value, count]) => {
                if (axis === 'machine') {
                    const d = machineDisplay(value);
                    return { value, count, label: d?.name || value, emoji: d?.emoji };
                }
                if (axis === 'harness') {
                    // The facet key is the raw harness name (`claude_code`). Every other surface
                    // on this page shows the server's registered label and logo for it, session
                    // rows included, so the chip does too — same `harnessMap`, no icon table and
                    // no second request. A harness the server has not registered keeps its raw
                    // name as the label: that is what the session itself reports, and inventing a
                    // prettier one here would be a second source of truth for the same string.
                    const info = harnessMap.get(value);
                    return {
                        value,
                        count,
                        label: info?.label || value,
                        emoji: info?.emoji || undefined,
                        image: info?.image,
                    };
                }
                return { value, count, label: value };
            });
            opts.sort((a, b) => a.label.localeCompare(b.label));
            out[axis] = opts;
        }
        return out;
        // `harnessMap` arrives from a poll, so it is empty on the first render and fills in
        // a moment later. Left out of these deps the chips keep the raw ids until something
        // unrelated re-renders them, which is indistinguishable from the bug being unfixed.
    }, [facets, filter, machineDisplay, harnessMap]);
    const activeFilterCount = AXES.reduce((n, a) => n + filter[a].length, 0);
    const searchActive = filter.search.trim() !== '';
    // How many rows the list is actually showing. `groups` IS chat-core's
    // `visibleSessions`, so summing it is the same number `visibleCount` reports —
    // not a second opinion about what is on screen.
    const visibleSessionCount = useMemo(() => groups.reduce((n, g) => n + g.sessions.length, 0), [groups]);
    // An empty list means two different things and only this tells them apart: with no
    // filter on, nothing has arrived; with one on, everything is filtered out. So the
    // "Connecting…" empty state is gated on it — saying "connecting" over a filter that
    // simply matches nothing would blame the network for the user's own filter.
    const anyFilterActive = activeFilterCount > 0 || filter.search.trim() !== '';
    // What each visible session spawned.
    //
    // The parent list is every session currently in `groups` — one request for the whole
    // page, which is also what tells the sidebar WHICH rows have children. No count field
    // exists on the wire and none was added: the children come back, and their number is
    // their number.
    //
    // ⚠️ The read is deliberately OUTSIDE the filter. `groups` is chat-core's filtered
    // set and is used here only to decide which parents to ASK about; the children
    // themselves are whatever the server says that parent spawned, so a chip, a search
    // term or the hidden-type default cannot remove one from its parent's list. A list of
    // "what this session spawned" that silently drops three of eight is worse than none.
    const visibleSessionIds = useMemo(() => groups.flatMap((g) => g.sessions.map((s) => s.sessionId)), [groups]);
    const subagentsOf = useSubagentSessions(visibleSessionIds);
    // Which parents are showing their children. In memory, not persisted: unlike a
    // collapsed folder — which is how the user has arranged their workspace — this is
    // transient exploration, and a tree that reopened itself on every load would fight
    // the reason the rows are collapsed in the first place.
    const [expandedSubagentParents, setExpandedSubagentParents] = useState(() => new Set());
    const toggleSubagents = useCallback((sessionId) => {
        setExpandedSubagentParents((previous) => {
            const next = new Set(previous);
            if (next.has(sessionId))
                next.delete(sessionId);
            else
                next.add(sessionId);
            return next;
        });
    }, []);
    // Rows: folder headers (collapsible) + session rows. All filtering (incl. the
    // machine axis) is chat-core's now — `groups` already reflect it. Flattened into
    // one virtualized list.
    const rows = useMemo(() => {
        const out = [];
        for (const g of groups) {
            const sessions = g.sessions;
            // chat-core now emits a group for every folder the SERVER holds, including ones
            // holding nothing — an empty folder is a real row and the sidebar has to be able
            // to draw it (and, once the context-menu child lands, file into it). The one case
            // it is only noise is an active transcript search, where the user is reading hits
            // and a stack of zero-count headers pushes them off screen. Chip filters keep
            // their empty headers, which is what bridge-ui does. Whether a search should
            // flatten the grouping ENTIRELY, as bridge-ui's does, is a product call and it
            // belongs to the search-ranking todo (`31314d6d`), not here.
            if (sessions.length === 0 && searchActive)
                continue;
            // The collapse key is the real folder name — '' for the unfoldered bucket — while
            // 'active' is only its label. Keying by the label would make a server folder
            // actually named "active" collapse the unfoldered sessions along with it.
            const folder = g.folder;
            const label = folder || 'active';
            const collapsed = collapsedFolders.has(folder);
            // The rollup count. Counted over `g.sessions`, which IS the filtered set, so a
            // session the active chips exclude is not counted — see the exclusions comment on
            // `SessionRow`. Archived sessions are excluded by folder, so the whole Archive
            // folder header carries no marker either: the user archived those, which is the act
            // of saying they were not going to continue them.
            //
            // It counts the LOADED window, like every other number on this sidebar — the same
            // population as the `bc-folder-count` beside it, so the two cannot disagree. A
            // waiting session on an older page is still not counted, but that is now a CHOICE
            // rather than a limit: the cross-session signals read knows about it, and the count
            // deliberately stays consistent with the row count beside it. Surfacing those is the
            // inbox's job, and there is no inbox here yet.
            const waitingCount = isArchivedFolder(folder)
                ? 0
                : sessions.reduce((n, s) => (waitingOnHuman(s.sessionId, effectiveState(s.sessionId)) ? n + 1 : n), 0);
            out.push(
            // A DIV, not a button, since the header now holds a second control. The class is
            // still bridge-ui's `bc-folder-header` — that rule styles a flex row and does not
            // care about the tag — and the chevron/name/count moved into an inner button so
            // the two controls are siblings rather than a button nested in a button.
            _jsxs("div", { className: "bc-folder-header", onContextMenu: (e) => openFolderMenu(e, folder), children: [_jsxs("button", { type: "button", className: styles.folderHeaderMain, "aria-expanded": !collapsed, onClick: () => toggleFolderCollapsed(folder), children: [_jsx("span", { className: "bc-folder-chevron", children: collapsed ? '▸' : '▾' }), _jsx("span", { className: "bc-folder-icon", children: "\uD83D\uDCC1" }), _jsx("span", { className: "bc-folder-name", children: label }), _jsx("span", { className: "bc-folder-count", children: sessions.length })] }), _jsx(FolderQuestionRollupMarker, { waitingCount: waitingCount, collapsed: collapsed, folderLabel: label, onReveal: () => expandFolder(folder) })] }, `h:${folder}`));
            if (collapsed)
                continue;
            for (const s of sessions) {
                out.push(_jsx(SessionRow, { session: s, harnessInfo: harnessMap.get(s.harness), basePath: basePath, displayState: effectiveState(s.sessionId), hasOpenQuestion: sessionsWithOpenQuestion.has(s.sessionId), active: s.sessionId === activeId, subagentCount: subagentsOf(s.sessionId).length, subagentsExpanded: expandedSubagentParents.has(s.sessionId), onToggleSubagents: toggleSubagents, 
                    // Only the row whose panel is open, and the one that just closed, see this
                    // prop change — every other row's props are identical and `SessionRow`'s
                    // `memo` bails out. Rebuilding this array is cheap; re-rendering hundreds of
                    // rows would not be.
                    questionOpen: s.sessionId === openQuestionSessionId, onSelect: select, onPrefetch: prefetch, onArchive: archive, onUnarchive: unarchive, onRename: rename, onContextMenu: openSessionMenu, onToggleQuestion: toggleQuestionPanel, onDismissQuestion: closeQuestionPanel }, s.sessionId));
                // The sessions this one spawned, drawn under it.
                //
                // ⚠️ These come from `subagentsOf`, NOT from `groups`, and that is the whole
                // point rather than a shortcut. `groups` is chat-core's FILTERED set, so a
                // child excluded by a chip, by the search box or by the hidden-type default
                // would silently vanish from its parent's list — and a list of "what this
                // session spawned" that quietly drops three of eight is worse than none. Being
                // a separate read is what makes them immune to all of it.
                //
                // They are full `SessionRow`s: the same component, the same click-to-open, the
                // same status dot. A child that ALSO appears in the flat list therefore appears
                // twice, which is intended — the nested one is a copy, and pulling it out of the
                // main list would mean expanding a caret changed what the list above showed.
                //
                // One level, not a recursion, and that is measured rather than assumed: on this
                // host every one of the 1,325 subagent sessions is a direct child of a top-level
                // session — 8,388 roots, 1,325 children, zero grandchildren. The store does
                // support deeper trees (`internal/store/subagent_test.go` pins an L2), so if
                // that histogram ever grows a third bucket this is the place that needs to
                // learn recursion.
                if (expandedSubagentParents.has(s.sessionId)) {
                    for (const child of subagentsOf(s.sessionId)) {
                        out.push(_jsx(SessionRow
                        // Prefixed with the parent, because the same session can be BOTH a row
                        // in the flat list and a row under its parent — and these go into ONE
                        // flat array of siblings, so the bare session id would appear twice as a
                        // key.
                        //
                        // ⚠️ Measured, not assumed: swapping this for the bare id does NOT drop
                        // a row, and the spec beside this stays green with it. React's
                        // production build renders both and only warns in development, so a
                        // duplicate key here is undefined reconciliation behaviour rather than a
                        // visible break — the kind that surfaces later as row state attaching to
                        // the wrong row. Scoped because it is right, not because a test caught
                        // it; do not read the green spec as proof this line is load-bearing.
                        , { session: child, harnessInfo: harnessMap.get(child.harness), basePath: basePath, 
                            // ⚠️ `effectiveState` answers '' for a session the STORE has never
                            // loaded, and a fetched child is exactly that — being outside the
                            // loaded window is why it had to be fetched. Left at that, every child
                            // drew with no status dot and no running mark, i.e. the one thing this
                            // list is opened to see.
                            //
                            // This is not a fallback across unrelated sources: `effectiveState`
                            // reconciles the store's row against its warm tail, and where there is
                            // no row there is no tail either, so the child's OWN state — the same
                            // field, from the same server, by a different read — is the whole
                            // answer rather than a guess at one.
                            displayState: effectiveState(child.sessionId) || child.state, hasOpenQuestion: sessionsWithOpenQuestion.has(child.sessionId), active: child.sessionId === activeId, 
                            // A child's own children are not drawn — see the note above on depth.
                            subagentCount: 0, subagentsExpanded: false, onToggleSubagents: toggleSubagents, nested: true, questionOpen: child.sessionId === openQuestionSessionId, onSelect: select, onPrefetch: prefetch, onArchive: archive, onUnarchive: unarchive, onRename: rename, onContextMenu: openSessionMenu, onToggleQuestion: toggleQuestionPanel, onDismissQuestion: closeQuestionPanel }, `sub:${s.sessionId}:${child.sessionId}`));
                    }
                }
            }
        }
        return out;
    }, [
        groups,
        searchActive,
        activeId,
        machineDisplay,
        harnessMap,
        basePath,
        collapsedFolders,
        select,
        prefetch,
        archive,
        unarchive,
        rename,
        effectiveState,
        waitingOnHuman,
        sessionsWithOpenQuestion,
        openFolderMenu,
        openSessionMenu,
        openQuestionSessionId,
        toggleQuestionPanel,
        closeQuestionPanel,
        toggleFolderCollapsed,
        expandFolder,
        // ⚠️ All three, or the tree is stale in a way nothing reports. `subagentsOf`'s
        // identity changes when a fetch lands or the store gains a child, and that is the
        // only signal that a caret should now exist; omitting it leaves rows that spawned
        // something looking like rows that did not, forever.
        subagentsOf,
        expandedSubagentParents,
        toggleSubagents,
    ]);
    // The session the open menu points at, resolved from the loaded window so the menu
    // can tick the folder it is already in and offer "Mark done" or its undo. Null while
    // no session menu is open, or if the row left the window under the open menu.
    const ctxSession = useMemo(() => {
        if (ctxMenu?.type !== 'session')
            return null;
        for (const g of groups) {
            for (const s of g.sessions)
                if (s.sessionId === ctxMenu.sessionId)
                    return s;
        }
        return null;
    }, [ctxMenu, groups]);
    // What the bare "+ New" button will actually launch: the instance `newTarget` resolved,
    // and the harness and machine that instance belongs to. Read off the SAME
    // `newTarget.opts` the click passes, not a second resolution of the prefs ladder, so the
    // icons cannot name one target while the click starts another. Undefined all the way
    // down when nothing is recorded — the button then shows no target because it has none,
    // rather than naming a guess.
    const newInstance = newTarget.opts ? instanceMap.get(newTarget.opts.instanceId) : undefined;
    const newHarness = newTarget.opts ? harnessMap.get(newTarget.opts.harness) : undefined;
    // The instance's own embedded machine first, the registry second — the same order
    // `SessionHeader` and `NewSessionMenu` read it in, so all three name one machine even
    // on the first paint, before the `/machines` poll has answered.
    const newMachine = newInstance?.machine ?? (newInstance ? machineMap.get(newInstance.machine_id) : undefined);
    // `sessionListColumn` is what makes the virtualizer below size itself: bridge-ui's
    // `bc-session-list` is a scrolling block, and this list scrolls one step further in
    // (see the rule in Chat.module.css).
    return (_jsxs("div", { className: `bc-session-list ${styles.sessionListColumn}`, children: [_jsxs("div", { className: "bc-new-session", children: [_jsxs("div", { className: "bc-new-session-wrap", children: [_jsxs("div", { className: "bc-new-session-split", children: [_jsxs("button", { className: "bc-new-session-btn", onClick: () => newSession(newTarget.opts), disabled: !newTarget.ready, title: !newTarget.ready
                                            ? 'Loading your last-used instance…'
                                            : newInstance
                                                ? `New chat in ${newInstance.name}${newHarness ? ` (${newHarness.label}` : ''}${newMachine ? ` on ${newMachine.name})` : newHarness ? ')' : ''}`
                                                : 'New chat', children: [_jsx("span", { className: "bc-new-session-plus", "aria-hidden": true, children: "+" }), _jsx("span", { className: "bc-new-session-label", children: "New" }), newInstance && (_jsxs("span", { className: "bc-new-session-target", "aria-label": `${newHarness?.label || newInstance.harness_type} on ${newMachine?.name || 'machine'}`, children: [newHarness?.image ? (_jsx("img", { className: "bc-new-session-target-img", src: `${basePath}${newHarness.image}`, alt: "" })) : newHarness?.emoji ? (_jsx("span", { className: "bc-new-session-target-emoji", "aria-hidden": true, children: newHarness.emoji })) : null, newMachine?.emoji && (_jsxs(_Fragment, { children: [_jsx("span", { className: "bc-new-session-target-at", "aria-hidden": true, children: "@" }), _jsx("span", { className: "bc-new-session-target-emoji", "aria-hidden": true, children: newMachine.emoji })] }))] }))] }), _jsx("button", { className: "bc-new-session-caret-btn", onClick: () => setNewMenuOpen((v) => !v), "aria-haspopup": "menu", "aria-expanded": newMenuOpen, title: "Pick a harness / instance", "aria-label": "Choose harness or environment", children: _jsx("span", { className: "bc-new-session-caret", "aria-hidden": true, children: "\u25BE" }) })] }), newMenuOpen && (_jsx(NewSessionMenu, { onPick: ({ instanceId, harness }) => {
                                    // A deliberate pick is what the bare button reads next time.
                                    newTarget.remember(instanceId);
                                    // Through `optsFor`, not raw: the picked instance still needs that
                                    // harness's saved defaults merged on, exactly as the bare button's
                                    // `newTarget.opts` gets them. Passing the menu's bare pick through was
                                    // how a chat started from the picker ignored every default the user had
                                    // set for that harness.
                                    newSession(newTarget.optsFor(instanceId, harness));
                                }, onClose: () => setNewMenuOpen(false) }))] }), _jsx("button", { className: "bc-sidebar-collapse-btn", onClick: onToggleCollapse, title: "Collapse sessions", "aria-label": "Collapse sessions", children: "\u25C2" })] }), producerBasePath && (_jsx(ProducerRow, { apiFetch: bridgeApiFetch, producerBasePath: producerBasePath, orchestratorPath: routes.orchestrator })), _jsxs("div", { className: "bc-session-search", children: [_jsx("input", { type: "search", className: "bc-session-search-input", value: filter.search, onChange: (e) => set({ search: e.target.value }), placeholder: "Search name or transcript\u2026" }), searchActive && (_jsx("span", { className: "bc-session-search-status", role: "status", children: searching
                            ? 'searching…'
                            : `${visibleSessionCount} result${visibleSessionCount === 1 ? '' : 's'}` }))] }), searchActive && searchError && (_jsxs("div", { className: styles.searchReach, role: "status", children: ["Transcript search failed (", searchError, ") \u2014 showing name matches only."] })), contentSearchReach && contentSearchReach.hiddenHitCount > 0 && (_jsxs("div", { className: styles.searchReach, role: "status", children: [contentSearchReach.shownHitCount, " of ", contentSearchReach.truncated ? 'at least ' : '', contentSearchReach.hitCount, " transcript ", contentSearchReach.hitCount === 1 ? 'match' : 'matches', " shown", moreSessions ? ' — loading older sessions may surface more.' : '.'] })), _jsxs("div", { className: "bc-inst-filter", children: [_jsxs("button", { className: `bc-filter-toggle ${activeFilterCount > 0 ? 'bc-filter-toggle-active' : ''}`, onClick: () => setFiltersOpen((v) => !v), "aria-expanded": filtersOpen, children: [_jsx("span", { className: "bc-filter-chevron", children: filtersOpen ? '▾' : '▸' }), _jsx("span", { className: "bc-filter-label", children: "Filters" }), activeFilterCount > 0 && _jsx("span", { className: "bc-filter-badge", children: activeFilterCount })] }), filtersOpen && (_jsxs("div", { className: "bc-inst-filter-body", children: [AXES.map((axis) => {
                                const opts = axisOptions[axis];
                                // Show an axis when it offers a real choice (>1 option) or has an active
                                // selection to clear. MODE is a canonical axis the old chat always exposes,
                                // so keep it whenever it has ANY value — otherwise a homogeneous loaded set
                                // (all `events`) silently drops the whole group.
                                const show = opts.length > 1 || filter[axis].length > 0 || (axis === 'mode' && opts.length > 0);
                                return show ? (_jsx(ChipRow, { label: axis, options: opts, selected: filter[axis], basePath: basePath, onToggle: (value) => set({ [axis]: toggle(filter[axis], value) }) }, axis)) : null;
                            }), activeFilterCount > 0 && (_jsx("button", { className: "bc-inst-filter-clear", onClick: () => set({ harness: [], status: [], type: [], purpose: [], mode: [], machine: [] }), children: "show all" }))] }))] }), _jsx(SignalsInbox, { onSelectSession: select }), !connected && visibleSessionCount > 0 && (_jsx("div", { className: styles.sidebarDisconnected, children: connState === 'closed' ? 'Disconnected — list is frozen' : 'Reconnecting — list may be stale' })), (loading || (!connected && !anyFilterActive)) && visibleSessionCount === 0 ? (_jsx("div", { className: "bc-session-list-empty", children: connected ? 'Loading sessions…' : 'Connecting…' })) : (_jsxs(_Fragment, { children: [visibleSessionCount === 0 ? (
                    // An empty list has three causes and the user can only act on two of them,
                    // so naming which one it is IS the message. "No sessions match." was one
                    // string for all three: on a box with no sessions at all it blamed a filter
                    // that was not on, and the user's move — clear the filter — did not exist.
                    //
                    // The order is bridge-ui's (SessionList.tsx:531-545): search first, because
                    // an active search is the narrowest claim and the one the user just made.
                    // No new state — `searchActive` (:334) and `activeFilterCount` (:333) were
                    // already computed for the chip row above.
                    //
                    // "Searching…" still leads, for the reason it always did: while the
                    // transcript half is still out, any verdict is a verdict on half the
                    // evidence — the local name filter alone.
                    _jsx("div", { className: "bc-session-list-empty", children: searching
                            ? 'Searching…'
                            : searchActive
                                ? 'No sessions match this search'
                                : activeFilterCount > 0
                                    ? 'No sessions match the active filter'
                                    : 'No sessions yet' })) : (_jsx(VList, { ref: listRef, className: styles.list, onScroll: onScroll, children: rows })), moreSessions && (_jsx("button", { type: "button", className: `bc-session-show-more ${styles.sessionPagerShim}`, onClick: loadOlderSessions, disabled: loadingOlderSessions, "aria-busy": loadingOlderSessions, children: loadingOlderSessions ? 'Loading older sessions…' : 'Load older sessions' }))] })), (folderError || actionError) && (_jsx("div", { className: styles.sidebarError, role: "alert", children: folderError || actionError })), ctxMenu && (_jsxs("div", { className: "bc-ctx-menu", style: { top: ctxMenu.y, left: ctxMenu.x }, onClick: (e) => e.stopPropagation(), children: [ctxMenu.type === 'session' && (_jsxs(_Fragment, { children: [_jsx("button", { className: "bc-ctx-menu-item", onClick: () => {
                                    const id = ctxMenu.sessionId;
                                    const done = ctxSession?.folderName === ARCHIVE_FOLDER;
                                    closeMenu();
                                    if (done)
                                        unarchive(id);
                                    else
                                        archive(id);
                                }, children: ctxSession?.folderName === ARCHIVE_FOLDER ? '↺ Unmark / unarchive' : '✓ Mark done' }), _jsx("div", { className: "bc-ctx-menu-divider" }), _jsx("div", { className: "bc-ctx-menu-label", children: "Move to folder" }), ctxSession?.folderName && ctxSession.folderName !== ARCHIVE_FOLDER && (_jsx("button", { className: "bc-ctx-menu-item", onClick: () => {
                                    const id = ctxMenu.sessionId;
                                    closeMenu();
                                    moveSessionToFolder(id, '');
                                }, children: "\u21A9 Remove from folder" })), folders.map((f) => (_jsxs("button", { className: `bc-ctx-menu-item ${ctxSession?.folderName === f ? 'bc-ctx-menu-item-active' : ''}`, onClick: () => {
                                    const id = ctxMenu.sessionId;
                                    closeMenu();
                                    moveSessionToFolder(id, f);
                                }, children: ["\uD83D\uDCC1 ", f] }, f)))] })), ctxMenu.type === 'folder' && folderForm !== 'rename' && (_jsxs(_Fragment, { children: [_jsx("button", { className: "bc-ctx-menu-item", onClick: () => {
                                    setFolderDraft(ctxMenu.folder);
                                    setFolderForm('rename');
                                }, children: "\u270E Rename folder" }), _jsxs("button", { className: "bc-ctx-menu-item bc-ctx-menu-item-danger", onClick: () => {
                                    const name = ctxMenu.folder;
                                    closeMenu();
                                    deleteFolder(name);
                                }, children: ["\uD83D\uDDD1 Delete \u201C", ctxMenu.folder, "\u201D (sessions are un-filed, not deleted)"] }), _jsx("div", { className: "bc-ctx-menu-divider" })] })), folderForm ? (_jsxs("div", { className: "bc-ctx-new-folder", children: [_jsx("input", { ref: folderInputRef, className: "bc-ctx-new-folder-input", value: folderDraft, onChange: (e) => setFolderDraft(e.target.value), onKeyDown: (e) => {
                                    if (e.key === 'Enter')
                                        submitFolderForm();
                                    if (e.key === 'Escape') {
                                        setFolderForm(null);
                                        setFolderDraft('');
                                    }
                                }, placeholder: folderForm === 'rename' ? 'New folder name' : 'Folder name', "aria-label": folderForm === 'rename' ? 'New folder name' : 'New folder name' }), _jsx("button", { className: "bc-ctx-new-folder-btn", onClick: submitFolderForm, children: "\u2713" })] })) : (_jsx("button", { className: "bc-ctx-menu-item", onClick: () => setFolderForm('new'), children: "+ New folder" }))] }))] }));
}
function ChipRow({ label, options, selected, basePath, onToggle, }) {
    return (_jsxs("div", { className: "bc-inst-filter-chips bc-class-filter-row", children: [_jsx("span", { className: "bc-class-filter-label", children: label }), options.map((o) => (_jsxs("button", { type: "button", className: `bc-inst-chip bc-class-chip ${selected.includes(o.value) ? 'bc-inst-chip-active' : ''}`, onClick: () => onToggle(o.value), 
                // Facet counts tally the LOADED window only (see selectFacets), and the
                // sidebar is one page deep until the user pages. This tooltip used to read
                // "<label> · N session(s)", which sounds like a total for the box and is
                // wrong by thousands. Name the population the number actually describes.
                title: `${o.label} · ${o.count} of the loaded session(s)`, children: [o.image ? (_jsx("img", { className: "bc-inst-chip-img", src: `${basePath}${o.image}`, alt: "" })) : o.emoji ? (_jsx("span", { className: "bc-inst-chip-emoji", children: o.emoji })) : null, _jsx("span", { className: "bc-class-chip-name", children: o.label }), _jsx("span", { className: styles.chipCount, children: o.count })] }, o.value)))] }));
}
const SessionRow = memo(function SessionRow({ session, harnessInfo, basePath, displayState, hasOpenQuestion, active, questionOpen, onSelect, onPrefetch, onArchive, onUnarchive, onRename, onContextMenu, onToggleQuestion, onDismissQuestion, subagentCount, subagentsExpanded, onToggleSubagents, nested = false, }) {
    const isArchived = isArchivedFolder(session.folderName);
    const name = session.displayName || session.sessionId;
    const harnessTitle = harnessInfo?.label || session.harness;
    // Two deliberate exclusions, both of them product decisions rather than oversights:
    //
    //  - ARCHIVED sessions never surface a `?`. Archiving a session is the user saying they
    //    were not going to continue it; a question it stopped on is not work waiting on
    //    them, and a marker would be the list asking them to reconsider every session they
    //    have already dismissed. The row keeps its ordinary status dot — the state is still
    //    the state, and hiding that would be a lie — it just gets no way to open the
    //    question from here.
    //  - Sessions the active FILTER CHIPS exclude never surface one either, and that falls
    //    out of where the marker lives: `groups` is chat-core's filtered set, so a row that
    //    is filtered out is not rendered and has nothing to draw a marker on. The sidebar
    //    deliberately does not reach past the filter to count them — a filter is the user
    //    narrowing what they want to see, and a badge that ignored it would be a second,
    //    louder list.
    // The union — see `waitingOnHuman` in `Sidebar`. A question outlives the state that
    // raised it, so `completed` and `aborted` rows keep their `?`; `awaiting_permission`
    // mints no signal, so the state half still has to be here.
    const awaitingHuman = !isArchived && (hasOpenQuestion || isSessionAwaitingHuman(displayState));
    // A subagent that is still working. Marked explicitly rather than left to the status
    // dot, because the dot's job is the state vocabulary and this list is opened to answer
    // one narrower question — which of these is still going. ⚠️ It cannot be read off a
    // terminal state instead: subagent sessions settle to `idle`, not `completed`, so
    // "finished" and "never started" are the same value.
    const running = nested && isRunningState(displayState);
    return (_jsxs("div", { className: [
            'bc-session-item',
            active ? 'bc-session-item-selected' : '',
            nested ? styles.subagentRow : '',
            running ? styles.subagentRowRunning : '',
        ]
            .filter(Boolean)
            .join(' '), onMouseEnter: () => onPrefetch(session.sessionId), onContextMenu: (e) => onContextMenu(e, session.sessionId), children: [subagentCount > 0 && (_jsxs("button", { type: "button", className: styles.subagentToggle, "aria-expanded": subagentsExpanded, "aria-label": subagentsExpanded
                    ? `Hide the ${subagentCount} sessions ${name} spawned`
                    : `Show the ${subagentCount} sessions ${name} spawned`, title: `${subagentCount} subagent session${subagentCount === 1 ? '' : 's'}`, onClick: () => onToggleSubagents(session.sessionId), children: [_jsx("span", { "aria-hidden": true, children: subagentsExpanded ? '▾' : '▸' }), _jsx("span", { className: styles.subagentToggleCount, children: subagentCount })] })), awaitingHuman && (_jsx(SessionQuestionMarker, { sessionId: session.sessionId, sessionName: name, displayState: displayState, isActiveSession: active, open: questionOpen, onToggle: onToggleQuestion, onDismiss: onDismissQuestion })), _jsxs("button", { className: "bc-session-item-main", onClick: () => onSelect(session.sessionId), children: [_jsx("span", { className: "bc-session-harness", title: harnessTitle, children: harnessInfo?.image ? (_jsx("img", { src: `${basePath}${harnessInfo.image}`, alt: "" })) : (_jsx("span", { className: "bc-session-harness-emoji", children: harnessInfo?.emoji || '·' })) }), !awaitingHuman && _jsx(StatusDot, { state: displayState, title: displayState }), _jsx(EditableName, { value: name, onSave: (next) => onRename(session.sessionId, next), className: "bc-session-label" })] }), _jsx("span", { className: "bc-session-menu-btn", role: "button", tabIndex: 0, title: isArchived ? 'Unarchive' : 'Archive', onClick: (e) => {
                    e.stopPropagation();
                    if (isArchived)
                        onUnarchive(session.sessionId);
                    else
                        onArchive(session.sessionId);
                }, children: isArchived ? '↺' : '🗄' })] }));
});
//# sourceMappingURL=Sidebar.js.map