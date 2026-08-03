import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useBridgeSession } from '../useBridgeSession';
import { useBridgePrefs } from '../useBridgePrefs';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeMachines } from '../useBridgeMachines';
import { useBridgeHarnesses } from '../useBridgeHarnesses';
import { useBridgeFolders } from '../useBridgeFolders';
import { SessionList } from './chat/SessionList';
import { Workspace } from './chat/Workspace';
import { WorkspaceLayout } from './chat/WorkspaceLayout';
import { useMinimalChrome, useRegisterMinimalChrome } from './minimal/MinimalChromeContext';
import { MinimalTopBar } from './minimal/MinimalTopBar';
import { MinimalPaneSwitch } from './minimal/MinimalPaneSwitch';
import { SessionDrawer } from './minimal/SessionDrawer';
import { ChromeSheet } from './minimal/ChromeSheet';
import { loadCollapseState, loadWorkspacesState, saveCollapseState, saveWorkspacesState } from './chat/persistence';
import { initialSessionDeeplinkState, readSessionDeeplink, writeSessionParam } from '../sessionDeeplink';
import { splitModeAxis } from './chat/types';
import { buildFlatLayout, firstLeafId, iterateLeafIds, removeLeaf, splitLeaf } from './chat/workspaceTree';
const DEFAULT_INNER_TREE = {
    kind: 'split',
    direction: 'h',
    children: [
        { kind: 'leaf', viewType: 'turns' },
        { kind: 'leaf', viewType: 'thread' },
        { kind: 'leaf', viewType: 'timeline' },
        { kind: 'leaf', viewType: 'git' },
        { kind: 'leaf', viewType: 'kanban' },
        { kind: 'leaf', viewType: 'orchestrator' },
        { kind: 'leaf', viewType: 'attach' },
    ],
};
// 'attach' is hidden by default and auto-shown by Workspace when the
// active session enters pty mode. Keeping it hidden by default avoids
// cluttering events-mode workspaces with an inert terminal pane.
const DEFAULT_PANES_HIDDEN = { turns: false, thread: true, timeline: true, git: true, kanban: true, orchestrator: true, attach: true };
const DEFAULT_PANE_SIZES = { turns: 1, thread: 1, timeline: 1, git: 1, kanban: 1, orchestrator: 1, attach: 1 };
// Backfill missing PaneKey leaves into a persisted workspace's inner layout
// tree. New PaneKeys (e.g. 'kanban' added 2026-05-07, 'attach' added
// 2026-05-14) need to be present in the tree of pre-existing workspaces
// so their toggle has something to show.
function ensurePaneLeaves(node) {
    const present = new Set();
    const walk = (n) => {
        if (n.kind === 'leaf') {
            present.add(n.viewType);
            return;
        }
        n.children.forEach(walk);
    };
    walk(node);
    const missing = ['turns', 'thread', 'timeline', 'git', 'kanban', 'orchestrator', 'attach']
        .filter(k => !present.has(k))
        .map(k => ({ kind: 'leaf', viewType: k }));
    if (missing.length === 0)
        return node;
    if (node.kind === 'leaf') {
        return { kind: 'split', direction: 'h', children: [node, ...missing] };
    }
    return { ...node, children: [...node.children, ...missing] };
}
// Resolve a SplitMode to a concrete axis + position. 'split-auto' looks at
// the currently focused workspace pane and picks the longer side; ties and
// missing rect fall back to horizontal (split right) which mirrors the prior
// default behavior.
function resolveSplitMode(mode) {
    const directional = splitModeAxis(mode);
    if (directional)
        return directional;
    if (mode === 'split-auto') {
        const el = typeof document !== 'undefined'
            ? document.querySelector('.bc-workspace-focused')
            : null;
        if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.height > rect.width)
                return { axis: 'v', position: 'after' };
        }
        return { axis: 'h', position: 'after' };
    }
    // 'replace' falls through here when the tree is non-empty: behave like a
    // sensible default split so the new leaf is never orphaned.
    return { axis: 'h', position: 'after' };
}
function makeWorkspace(sessionId, seed) {
    return {
        id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        panesHidden: { ...DEFAULT_PANES_HIDDEN },
        paneSizes: { ...DEFAULT_PANE_SIZES },
        layout: DEFAULT_INNER_TREE,
        ...seed,
    };
}
// A "pending" new chat: a workspace with a live composer but no server
// session. The session is created on first send (see Workspace.handleSend).
function makePendingWorkspace(instanceId, harness) {
    return makeWorkspace(null, { pending: { instanceId, harness } });
}
// Tab-scoped flag, memoized once per page load. sessionStorage survives a
// reload but is empty in a freshly opened tab/window, so this distinguishes
// "opened a new dash page" (start on a fresh new chat, don't restore the last
// session) from "reloaded the current one" (restore the open session/splits).
// Reload re-imports this module, resetting the memo, and finds the key already
// set → not fresh. A brand-new tab finds no key → fresh, and sets it.
const TAB_STARTED_KEY = 'bridge-ui-tab-started';
let freshTabMemo = null;
function isFreshTab() {
    if (freshTabMemo !== null)
        return freshTabMemo;
    try {
        freshTabMemo = !sessionStorage.getItem(TAB_STARTED_KEY);
        sessionStorage.setItem(TAB_STARTED_KEY, '1');
    }
    catch {
        freshTabMemo = false;
    }
    return freshTabMemo;
}
export function BridgeChat() {
    const { fetch: apiFetch, basePath, producerBasePath, routes } = useBridgeConfig();
    const bridge = useBridgeSession();
    const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` });
    const instances = useBridgeInstances();
    const machines = useBridgeMachines();
    const { harnesses } = useBridgeHarnesses();
    const folders = useBridgeFolders();
    const [storeModels, setStoreModels] = useState([]);
    const [collapseState, setCollapseState] = useState(loadCollapseState);
    // Fresh tab/window: start empty so the bootstrap below opens a new chat
    // instead of restoring the last session. A same-tab reload restores as usual.
    const freshTab = useRef(isFreshTab()).current;
    const initialState = useRef(loadWorkspacesState());
    const [workspaces, setWorkspaces] = useState(() => freshTab ? [] : initialState.current.workspaces.map(w => ({
        ...w,
        panesHidden: { ...DEFAULT_PANES_HIDDEN, ...w.panesHidden },
        paneSizes: { ...DEFAULT_PANE_SIZES, ...w.paneSizes },
        layout: ensurePaneLeaves(w.layout),
    })));
    const [layout, setLayout] = useState(() => freshTab ? null : initialState.current.layout);
    const [focusedWorkspaceId, setFocusedWorkspaceId] = useState(() => freshTab ? null : initialState.current.focusedWorkspaceId);
    const bootstrappedRef = useRef(false);
    useEffect(() => {
        // Don't let a fresh tab's unstarted new chat clobber the persisted real
        // layout — a same-tab reload should still restore the open session. Once
        // the pending chat becomes real (or a real session is opened), it saves.
        if (workspaces.length > 0 && workspaces.every(w => w.pending))
            return;
        saveWorkspacesState({ workspaces, focusedWorkspaceId, layout });
    }, [workspaces, focusedWorkspaceId, layout]);
    // The instance a new chat (landing bootstrap + "+ New" button) targets,
    // resolved from recorded prefs only — never a first-enabled guess:
    //   1. the exact recorded last instance (last_instance_id), if still enabled;
    //   2. else an enabled instance of the recorded last harness (last_harness) —
    //      preferring one that's actually been used (has a last_session entry) —
    //      so the shown harness is the user's real last one, not an invented one;
    //   3. else undefined: nothing recorded, so we don't invent a target.
    const primaryInstanceId = useMemo(() => {
        const { last_instance_id, last_harness, last_session } = bridgePrefs.prefs;
        if (last_instance_id) {
            const inst = instances.instanceMap.get(last_instance_id);
            if (inst?.enabled)
                return inst.id;
        }
        if (last_harness) {
            const ofHarness = instances.instances.filter(i => i.enabled && i.harness_type === last_harness);
            const used = ofHarness.find(i => last_session && i.id in last_session);
            return (used ?? ofHarness[0])?.id;
        }
        return undefined;
    }, [bridgePrefs.prefs, instances.instances, instances.instanceMap]);
    const toggleSessionList = useCallback(() => {
        setCollapseState(s => { const next = { ...s, sessionList: !s.sessionList }; saveCollapseState(next); return next; });
    }, []);
    const updateWorkspace = useCallback((id, fn) => {
        setWorkspaces(prev => prev.map(w => w.id === id ? fn(w) : w));
    }, []);
    const closeWorkspace = useCallback((id) => {
        setWorkspaces(prev => prev.filter(w => w.id !== id));
        setLayout(prev => removeLeaf(prev, id));
        setFocusedWorkspaceId(curFocus => {
            if (curFocus !== id)
                return curFocus;
            // Pick a new focus from the post-removal tree using the latest layout
            // value below — read via setter.
            return null;
        });
    }, []);
    // After a close, ensure focus lands on something that still exists.
    useEffect(() => {
        if (focusedWorkspaceId && workspaces.some(w => w.id === focusedWorkspaceId))
            return;
        const next = firstLeafId(layout);
        if (next !== focusedWorkspaceId)
            setFocusedWorkspaceId(next);
    }, [layout, workspaces, focusedWorkspaceId]);
    // Add a workspace as a new leaf in the tree. Caller picks the split mode;
    // 'replace' is only meaningful when the tree is empty (it becomes the
    // root). With a non-empty tree, 'replace' falls back to a directional split
    // so the new workspace is never orphaned. 'split-auto' picks h or v based
    // on which dimension of the focused pane is longer.
    const placeWorkspace = useCallback((ws, mode) => {
        setWorkspaces(prev => [...prev, ws]);
        setLayout(prev => {
            if (!prev)
                return { kind: 'leaf', workspaceId: ws.id };
            const target = focusedWorkspaceId && [...iterateLeafIds(prev)].includes(focusedWorkspaceId)
                ? focusedWorkspaceId
                : firstLeafId(prev);
            if (!target)
                return { kind: 'leaf', workspaceId: ws.id };
            const resolved = resolveSplitMode(mode);
            return splitLeaf(prev, target, ws.id, resolved.axis, resolved.position);
        });
        setFocusedWorkspaceId(ws.id);
        return ws.id;
    }, [focusedWorkspaceId]);
    const addWorkspace = useCallback((sessionId, mode) => {
        return placeWorkspace(makeWorkspace(sessionId), mode);
    }, [placeWorkspace]);
    // Plain click on a session row: focus existing workspace if one exists for
    // that session, else retarget the focused workspace, else spawn one. Use
    // the per-row split buttons (or the New Session menu's split modes) to
    // explicitly open in a new split.
    const handleSelectSession = useCallback((id) => {
        if (!id)
            return;
        const existing = workspaces.find(w => w.sessionId === id);
        if (existing) {
            setFocusedWorkspaceId(existing.id);
        }
        else if (focusedWorkspaceId && workspaces.some(w => w.id === focusedWorkspaceId)) {
            setWorkspaces(prev => prev.map(w => w.id === focusedWorkspaceId ? { ...w, sessionId: id, pending: undefined } : w));
        }
        else {
            addWorkspace(id, 'replace');
        }
        const session = bridge.sessions.find(s => s.session_id === id);
        if (session?.instance_id) {
            bridgePrefs.setLastSession(session.instance_id, id);
            bridgePrefs.setLastInstanceId(session.instance_id);
        }
    }, [workspaces, focusedWorkspaceId, bridge.sessions, bridgePrefs, addWorkspace]);
    // Open an existing session in a new split rather than retargeting focus.
    const handleOpenSessionInSplit = useCallback((id, mode) => {
        if (!id)
            return;
        addWorkspace(id, mode);
        const session = bridge.sessions.find(s => s.session_id === id);
        if (session?.instance_id) {
            bridgePrefs.setLastSession(session.instance_id, id);
            bridgePrefs.setLastInstanceId(session.instance_id);
        }
    }, [addWorkspace, bridge.sessions, bridgePrefs]);
    useEffect(() => {
        apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data) => {
            setStoreModels(data.filter(m => m.enabled));
        }).catch(() => { });
    }, [apiFetch, basePath]);
    // Bootstrap on first ready render: open a fresh pending "new chat" so a new
    // window / reload lands on a ready-to-type composer rather than the last
    // conversation. Only fires when nothing real was restored from localStorage
    // (restored splits are left as-is — we don't stack an empty pane on top of
    // them). The pending chat targets the recorded most-recently-used instance
    // only; if none is recorded it does not open one. Gated on bridgePrefs.loaded
    // so the last-instance choice isn't lost to an empty prefs snapshot.
    useEffect(() => {
        if (bootstrappedRef.current)
            return;
        if (instances.loading || !bridgePrefs.loaded)
            return;
        bootstrappedRef.current = true;
        if (workspaces.length > 0)
            return;
        const inst = primaryInstanceId ? instances.instanceMap.get(primaryInstanceId) : undefined;
        if (!inst || !inst.enabled)
            return;
        const ws = makePendingWorkspace(inst.id, inst.harness_type);
        setWorkspaces([ws]);
        setLayout(buildFlatLayout([ws.id]));
        setFocusedWorkspaceId(ws.id);
    }, [bridgePrefs.loaded, primaryInstanceId, instances.loading, instances.instanceMap, workspaces.length]);
    // Deeplink support, both ways: ?session=<bridge_id> opens that session, and
    // the param then keeps naming whatever session the focused pane holds. Used
    // by kanban cards (and BridgeSessions) to send the user into chat focused on
    // a specific session, and it takes precedence over the last-used-session
    // bootstrap above.
    //
    // The param used to be deleted once read, which left the address bar with no
    // link back to the open session — nothing to bookmark, share or reload into,
    // even though hrefFor() emits links in exactly that shape. The reconciler in
    // sessionDeeplink.ts holds the small amount of state that keeps the two
    // effects below from pushing a stale id at each other; see its header.
    const [searchParams, setSearchParams] = useSearchParams();
    const deeplinkRef = useRef(initialSessionDeeplinkState);
    const urlObservedRef = useRef(false);
    useEffect(() => {
        const { open, state } = readSessionDeeplink(searchParams.get('session'), deeplinkRef.current);
        deeplinkRef.current = state;
        urlObservedRef.current = true;
        if (!open)
            return;
        bootstrappedRef.current = true;
        handleSelectSession(open);
    }, [searchParams, handleSelectSession]);
    const focusedSessionId = useMemo(() => {
        const ws = workspaces.find(w => w.id === focusedWorkspaceId);
        return ws?.sessionId ?? null;
    }, [workspaces, focusedWorkspaceId]);
    useEffect(() => {
        // Never write before the URL has been read, or a restored session would
        // overwrite an inbound deeplink before anyone looked at it.
        if (!urlObservedRef.current)
            return;
        const { write, value, state } = writeSessionParam(focusedSessionId, deeplinkRef.current);
        deeplinkRef.current = state;
        if (!write)
            return;
        const next = new URLSearchParams(searchParams);
        if (value)
            next.set('session', value);
        else
            next.delete('session');
        setSearchParams(next, { replace: true });
    }, [focusedSessionId, searchParams, setSearchParams]);
    const getDisplayName = useCallback((session) => {
        return session.display_name || session.agent_id || '';
    }, []);
    // Open a new chat. This creates NO server session — it drops a "pending"
    // workspace with a live composer; the real session is created lazily on
    // first send (Workspace.handleSend). That makes new-chat open instantly
    // (no round-trip, so the chat pane no longer lags behind the sidebar) and
    // means an abandoned new chat never leaves a dangling session behind.
    // Default mode = replace focused workspace (matches sidebar select
    // behavior); any 'split-*' mode spawns a new pane.
    const handleNewChatForInstance = useCallback((instanceId, mode = 'replace') => {
        const inst = instances.instanceMap.get(instanceId);
        if (!inst)
            return;
        const harness = inst.harness_type;
        const harnessInfo = harnesses.find(h => h.name === harness);
        if (!harnessInfo?.available)
            return;
        // Remember the chosen instance so the "+ New" button reflects it next time.
        bridgePrefs.setLastInstanceId(instanceId);
        const ws = makePendingWorkspace(instanceId, harness);
        // 'replace' means "swap the current window for a new chat" — the same
        // behavior as clicking a session in the sidebar. Target the focused pane,
        // or the first pane when focus is stale, and reuse its id so the layout is
        // undisturbed. Without the firstLeafId fallback a missing focus dropped
        // through to placeWorkspace, which splits a non-empty layout — so the bare
        // "+ New" button spawned a side-by-side pane instead of replacing. Only an
        // explicit split mode (from the caret menu) reaches placeWorkspace now.
        if (mode === 'replace') {
            const targetId = (focusedWorkspaceId && workspaces.some(w => w.id === focusedWorkspaceId))
                ? focusedWorkspaceId
                : firstLeafId(layout);
            if (targetId) {
                setWorkspaces(prev => prev.map(w => w.id === targetId ? { ...ws, id: w.id } : w));
                setFocusedWorkspaceId(targetId);
                return;
            }
        }
        placeWorkspace(ws, mode);
    }, [bridgePrefs, instances.instanceMap, harnesses, focusedWorkspaceId, workspaces, layout, placeWorkspace]);
    // Called by a pending workspace once its first send has created the real
    // session — persist it as this instance's last session so nav / reopen
    // land on it.
    const handlePendingStarted = useCallback((instanceId, sessionId) => {
        bridgePrefs.setLastInstanceId(instanceId);
        bridgePrefs.setLastSession(instanceId, sessionId);
    }, [bridgePrefs]);
    const handleRenameSession = useCallback((id, name) => {
        bridge.renameSession(id, name);
    }, [bridge]);
    // Shared by the sidebar menu and the header Done button. markSessionDone
    // is atomic server-side; refreshSessions repaints the list so the chat
    // moves into (or out of) the Archive folder.
    const handleMarkSessionDone = useCallback(async (id, done) => {
        await folders.markSessionDone(id, done);
        bridge.refreshSessions();
    }, [folders, bridge]);
    const openSessionIds = useMemo(() => new Set(workspaces.map(w => w.sessionId).filter((id) => !!id)), [workspaces]);
    const defaultInstanceId = primaryInstanceId;
    const { minimal, setDrawerOpen, override, setOverride } = useMinimalChrome();
    // This component is the one that answers a narrow viewport, below: MinimalTopBar,
    // MinimalPaneSwitch, SessionDrawer and ChromeSheet all render under `minimal`.
    // Saying so is what lets the host hide its own header, and what lets BridgeLayout
    // drop its tab row — neither is safe on a page that draws none of this.
    useRegisterMinimalChrome(minimal);
    const [vw, setVw] = useState(() => typeof window === 'undefined' ? 1024 : window.innerWidth);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        const onResize = () => setVw(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    const showReengage = !minimal && override === 'full' && vw < 640;
    const focusedSession = useMemo(() => {
        if (!focusedSessionId)
            return null;
        return bridge.sessions.find(s => s.session_id === focusedSessionId) ?? null;
    }, [bridge.sessions, focusedSessionId]);
    const minimalTitle = focusedSession ? getDisplayName(focusedSession) : '';
    const handleSelectSessionMinimal = useCallback((id) => {
        handleSelectSession(id);
        setDrawerOpen(false);
    }, [handleSelectSession, setDrawerOpen]);
    const renderLeaf = useCallback((workspaceId) => {
        const w = workspaces.find(ws => ws.id === workspaceId);
        if (!w)
            return null;
        return (_jsx(Workspace, { workspace: w, focused: w.id === focusedWorkspaceId, onFocus: () => setFocusedWorkspaceId(w.id), onUpdate: fn => updateWorkspace(w.id, fn), onClose: () => closeWorkspace(w.id), onMarkDone: handleMarkSessionDone, onStartPending: handlePendingStarted, harnesses: harnesses, instances: instances.instances, machines: machines.machines, storeModels: storeModels, bridgePrefs: {
                getDefaults: bridgePrefs.getDefaults,
                setHarnessDefaults: bridgePrefs.setHarnessDefaults,
                setLastSession: bridgePrefs.setLastSession,
            } }));
    }, [workspaces, focusedWorkspaceId, harnesses, instances.instances, machines.machines, storeModels, bridgePrefs, updateWorkspace, closeWorkspace, handleMarkSessionDone, handlePendingStarted]);
    const sessionListEl = (_jsx(SessionList, { sessions: bridge.sessions, instances: instances.instances, machines: machines.machines, harnesses: harnesses, basePath: basePath, apiFetch: apiFetch, producerBasePath: producerBasePath, orchestratorPath: routes.orchestrator, instancesPath: routes.instances, defaultInstanceId: defaultInstanceId, openSessionIds: openSessionIds, focusedSessionId: focusedSessionId, onSelect: minimal ? handleSelectSessionMinimal : handleSelectSession, onOpenInSplit: handleOpenSessionInSplit, onNewChat: handleNewChatForInstance, connected: bridge.connected, getDisplayName: getDisplayName, getSessionUIState: bridge.getSessionUIState, onRename: handleRenameSession, folders: folders, onAfterFolderChange: bridge.refreshSessions, onToggleCollapse: toggleSessionList }));
    return (_jsxs("div", { className: `bc-container ${collapseState.sessionList ? 'bc-sidebar-collapsed' : ''} ${minimal ? 'bc-minimal' : ''}`, children: [minimal && _jsx(MinimalTopBar, { title: minimalTitle }), minimal && _jsx(MinimalPaneSwitch, {}), _jsxs("div", { className: "bc-main", children: [!minimal && (collapseState.sessionList ? (_jsxs("button", { className: "bc-sidebar-strip", onClick: toggleSessionList, title: "Show sessions", "aria-label": "Show sessions", children: [_jsx("span", { className: "bc-sidebar-strip-chevron", children: "\u25B8" }), _jsx("span", { className: "bc-sidebar-strip-label", children: "Sessions" })] })) : sessionListEl), _jsx("div", { className: "bc-workspaces", children: !layout ? (_jsx("div", { className: "bc-workspaces-empty", children: _jsx("div", { className: "bc-workspaces-empty-hint", children: "No workspaces open. Pick a session from the sidebar (or use the + button next to one) to open one." }) })) : (_jsx(WorkspaceLayout, { node: layout, renderLeaf: renderLeaf, onResize: (path, sizes) => setLayout(prev => prev ? applySizes(prev, path, sizes) : prev) })) })] }), minimal && (_jsxs(_Fragment, { children: [_jsx(SessionDrawer, { children: sessionListEl }), _jsx(ChromeSheet, {})] })), showReengage && (_jsx("button", { type: "button", className: "bc-mc-reengage", onClick: () => setOverride(null), "aria-label": "Switch to mobile layout", children: "Use mobile layout" }))] }));
}
function applySizes(node, path, sizes) {
    if (path.length === 0) {
        if (node.kind !== 'split')
            return node;
        return { ...node, sizes };
    }
    if (node.kind !== 'split')
        return node;
    const [head, ...rest] = path;
    const child = node.children[head];
    if (!child)
        return node;
    const updated = applySizes(child, rest, sizes);
    if (updated === child)
        return node;
    const children = node.children.slice();
    children[head] = updated;
    return { ...node, children };
}
//# sourceMappingURL=BridgeChat.js.map