import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBridgeConfig } from '../context';
import { useBridgeSession } from '../useBridgeSession';
import { useBridgePrefs } from '../useBridgePrefs';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeMachines } from '../useBridgeMachines';
import { useBridgeFolders } from '../useBridgeFolders';
import { SessionList } from './chat/SessionList';
import { Workspace } from './chat/Workspace';
import { WorkspaceLayout } from './chat/WorkspaceLayout';
import { useMinimalChrome } from './minimal/MinimalChromeContext';
import { MinimalTopBar } from './minimal/MinimalTopBar';
import { MinimalPaneSwitch } from './minimal/MinimalPaneSwitch';
import { SessionDrawer } from './minimal/SessionDrawer';
import { ChromeSheet } from './minimal/ChromeSheet';
import { loadCollapseState, loadWorkspacesState, saveCollapseState, saveWorkspacesState } from './chat/persistence';
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
        { kind: 'leaf', viewType: 'attach' },
    ],
};
// 'attach' is hidden by default and auto-shown by Workspace when the
// active session enters pty mode. Keeping it hidden by default avoids
// cluttering events-mode workspaces with an inert terminal pane.
const DEFAULT_PANES_HIDDEN = { turns: false, thread: true, timeline: true, git: true, kanban: true, attach: true };
const DEFAULT_PANE_SIZES = { turns: 1, thread: 1, timeline: 1, git: 1, kanban: 1, attach: 1 };
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
    const missing = ['turns', 'thread', 'timeline', 'git', 'kanban', 'attach']
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
export function BridgeChat() {
    const { fetch: apiFetch, basePath, routes } = useBridgeConfig();
    const bridge = useBridgeSession();
    const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` });
    const instances = useBridgeInstances();
    const machines = useBridgeMachines();
    const folders = useBridgeFolders();
    const [harnesses, setHarnesses] = useState([]);
    const [storeModels, setStoreModels] = useState([]);
    const [collapseState, setCollapseState] = useState(loadCollapseState);
    const initialState = useRef(loadWorkspacesState());
    const [workspaces, setWorkspaces] = useState(() => initialState.current.workspaces.map(w => ({
        ...w,
        panesHidden: { ...DEFAULT_PANES_HIDDEN, ...w.panesHidden },
        paneSizes: { ...DEFAULT_PANE_SIZES, ...w.paneSizes },
        layout: ensurePaneLeaves(w.layout),
    })));
    const [layout, setLayout] = useState(() => initialState.current.layout);
    const [focusedWorkspaceId, setFocusedWorkspaceId] = useState(() => initialState.current.focusedWorkspaceId);
    const bootstrappedRef = useRef(false);
    useEffect(() => {
        saveWorkspacesState({ workspaces, focusedWorkspaceId, layout });
    }, [workspaces, focusedWorkspaceId, layout]);
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
    const addWorkspace = useCallback((sessionId, mode) => {
        const ws = makeWorkspace(sessionId);
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
            setWorkspaces(prev => prev.map(w => w.id === focusedWorkspaceId ? { ...w, sessionId: id } : w));
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
    // Bootstrap one workspace from the last-used instance's last session on
    // first ready render — but only if nothing was restored from localStorage.
    useEffect(() => {
        if (bootstrappedRef.current)
            return;
        if (instances.loading)
            return;
        bootstrappedRef.current = true;
        if (workspaces.length > 0)
            return;
        const lastInstanceId = bridgePrefs.prefs.last_instance_id;
        if (!lastInstanceId || !instances.instanceMap.has(lastInstanceId))
            return;
        const lastId = bridgePrefs.getLastSession(lastInstanceId);
        if (lastId) {
            const ws = makeWorkspace(lastId);
            setWorkspaces([ws]);
            setLayout(buildFlatLayout([ws.id]));
            setFocusedWorkspaceId(ws.id);
        }
    }, [bridgePrefs, instances.loading, instances.instanceMap, workspaces.length]);
    // Deeplink support: ?session=<bridge_id> opens that session and clears the
    // param. Used by kanban cards (and BridgeSessions) to send the user into
    // chat focused on a specific session. Runs once; takes precedence over the
    // last-used-session bootstrap above.
    const [searchParams, setSearchParams] = useSearchParams();
    const deeplinkConsumedRef = useRef(false);
    useEffect(() => {
        if (deeplinkConsumedRef.current)
            return;
        const id = searchParams.get('session');
        if (!id)
            return;
        deeplinkConsumedRef.current = true;
        bootstrappedRef.current = true;
        handleSelectSession(id);
        const next = new URLSearchParams(searchParams);
        next.delete('session');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams, handleSelectSession]);
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
    }, [apiFetch, basePath]);
    const getDisplayName = useCallback((session) => {
        return session.display_name || session.agent_id || '';
    }, []);
    // New chat creation. Default mode = replace focused workspace's session
    // (matches sidebar select behavior); any 'split-*' mode spawns a new
    // workspace via addWorkspace (which resolves 'split-auto' to a direction).
    const handleCreateForInstance = useCallback(async (instanceId, mode = 'replace') => {
        const inst = instances.instanceMap.get(instanceId);
        if (!inst)
            return;
        const harness = inst.harness_type;
        const harnessInfo = harnesses.find(h => h.name === harness);
        if (!harnessInfo?.available)
            return;
        const defaults = bridgePrefs.getDefaults(harness);
        // Permission gating runs as a PreToolUse HTTP hook injected by
        // bridge-server (--settings → /permission/cc-prehook). The bypass
        // pref is read on every prehook call, so no per-session
        // permission_mode flag is needed — the harness always launches in
        // bypassPermissions to disable CC's own gate.
        const sess = await bridge.createSession({
            harness,
            instance_id: instanceId,
            display_name: '',
        });
        if (!sess)
            return;
        bridgePrefs.setLastInstanceId(instanceId);
        bridgePrefs.setLastSession(instanceId, sess.session_id);
        if (defaults.model || defaults.effort || defaults.max_budget || defaults.disabled_tools?.length) {
            bridge.sendConfig({
                model: defaults.model,
                effort: defaults.effort,
                max_budget: defaults.max_budget,
                disabled_tools: defaults.disabled_tools,
            });
        }
        // Replace focused workspace's session when possible — only spawn a new
        // workspace if the user chose split-h/-v or no workspace is focused.
        const focused = focusedWorkspaceId && workspaces.find(w => w.id === focusedWorkspaceId);
        if (mode === 'replace' && focused) {
            setWorkspaces(prev => prev.map(w => w.id === focused.id ? { ...w, sessionId: sess.session_id } : w));
        }
        else {
            addWorkspace(sess.session_id, mode === 'replace' ? 'replace' : mode);
        }
    }, [bridge, bridgePrefs, instances.instanceMap, harnesses, focusedWorkspaceId, workspaces, addWorkspace]);
    const handleRenameSession = useCallback((id, name) => {
        bridge.renameSession(id, name);
    }, [bridge]);
    const openSessionIds = useMemo(() => new Set(workspaces.map(w => w.sessionId).filter((id) => !!id)), [workspaces]);
    const focusedSessionId = useMemo(() => {
        const ws = workspaces.find(w => w.id === focusedWorkspaceId);
        return ws?.sessionId ?? null;
    }, [workspaces, focusedWorkspaceId]);
    const defaultInstanceId = bridgePrefs.prefs.last_instance_id;
    const { minimal, setDrawerOpen, override, setOverride } = useMinimalChrome();
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
        return (_jsx(Workspace, { workspace: w, focused: w.id === focusedWorkspaceId, onFocus: () => setFocusedWorkspaceId(w.id), onUpdate: fn => updateWorkspace(w.id, fn), onClose: () => closeWorkspace(w.id), harnesses: harnesses, instances: instances.instances, machines: machines.machines, storeModels: storeModels, bridgePrefs: {
                getDefaults: bridgePrefs.getDefaults,
                setHarnessDefaults: bridgePrefs.setHarnessDefaults,
                setLastSession: bridgePrefs.setLastSession,
            } }));
    }, [workspaces, focusedWorkspaceId, harnesses, instances.instances, machines.machines, storeModels, bridgePrefs, updateWorkspace, closeWorkspace]);
    const sessionListEl = (_jsx(SessionList, { sessions: bridge.sessions, instances: instances.instances, machines: machines.machines, harnesses: harnesses, basePath: basePath, apiFetch: apiFetch, instancesPath: routes.instances, defaultInstanceId: defaultInstanceId, openSessionIds: openSessionIds, focusedSessionId: focusedSessionId, onSelect: minimal ? handleSelectSessionMinimal : handleSelectSession, onOpenInSplit: handleOpenSessionInSplit, onNewSession: handleCreateForInstance, connected: bridge.connected, getDisplayName: getDisplayName, getSessionUIState: bridge.getSessionUIState, onRename: handleRenameSession, folders: folders, onAfterFolderChange: bridge.refreshSessions, onToggleCollapse: toggleSessionList }));
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