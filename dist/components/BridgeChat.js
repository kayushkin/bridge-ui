import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeSession } from '../useBridgeSession';
import { useBridgePrefs } from '../useBridgePrefs';
import { useBridgeInstances } from '../useBridgeInstances';
import { useBridgeFolders } from '../useBridgeFolders';
import { HarnessTabBar } from './chat/HarnessTabBar';
import { NewInstanceForm } from './chat/NewInstanceForm';
import { SessionList } from './chat/SessionList';
import { Workspace } from './chat/Workspace';
import { loadCollapseState, saveCollapseState } from './chat/persistence';
import { generateDefaultAgent, generateFrontendId } from './chat/utils';
const DEFAULT_INNER_TREE = {
    kind: 'split',
    direction: 'h',
    children: [
        { kind: 'leaf', viewType: 'turns' },
        { kind: 'leaf', viewType: 'thread' },
        { kind: 'leaf', viewType: 'timeline' },
        { kind: 'leaf', viewType: 'git' },
    ],
};
const DEFAULT_PANES_HIDDEN = { turns: false, thread: false, timeline: true, git: true };
const DEFAULT_PANE_SIZES = { turns: 1, thread: 1, timeline: 1, git: 1 };
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
    const folders = useBridgeFolders();
    const [harnesses, setHarnesses] = useState([]);
    const [selectedInstance, setSelectedInstance] = useState('');
    const [storeModels, setStoreModels] = useState([]);
    const [showNewInstance, setShowNewInstance] = useState(false);
    const [collapseState, setCollapseState] = useState(loadCollapseState);
    const [workspaces, setWorkspaces] = useState([]);
    const [focusedWorkspaceId, setFocusedWorkspaceId] = useState(null);
    const bootstrappedRef = useRef(false);
    const toggleHarnessBar = useCallback(() => {
        setCollapseState(s => { const next = { ...s, harnessBar: !s.harnessBar }; saveCollapseState(next); return next; });
    }, []);
    const toggleSessionList = useCallback(() => {
        setCollapseState(s => { const next = { ...s, sessionList: !s.sessionList }; saveCollapseState(next); return next; });
    }, []);
    const updateWorkspace = useCallback((id, fn) => {
        setWorkspaces(prev => prev.map(w => w.id === id ? fn(w) : w));
    }, []);
    const closeWorkspace = useCallback((id) => {
        setWorkspaces(prev => {
            const next = prev.filter(w => w.id !== id);
            setFocusedWorkspaceId(curFocus => {
                if (curFocus !== id)
                    return curFocus;
                return next[0]?.id ?? null;
            });
            return next;
        });
    }, []);
    const spawnWorkspace = useCallback((sessionId) => {
        const ws = makeWorkspace(sessionId);
        setWorkspaces(prev => [...prev, ws]);
        setFocusedWorkspaceId(ws.id);
    }, []);
    // Plain click on a session row: focus existing workspace if one exists for
    // that session, else retarget the focused workspace, else spawn one. Use
    // the + button to explicitly open in a new split.
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
            const ws = makeWorkspace(id);
            setWorkspaces(prev => [...prev, ws]);
            setFocusedWorkspaceId(ws.id);
        }
        if (selectedInstance)
            bridgePrefs.setLastSession(selectedInstance, id);
    }, [workspaces, focusedWorkspaceId, bridgePrefs, selectedInstance]);
    useEffect(() => {
        apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data) => {
            setStoreModels(data.filter(m => m.enabled));
        }).catch(() => { });
    }, [apiFetch, basePath]);
    const selectedHarness = useMemo(() => {
        if (!selectedInstance)
            return '';
        return instances.instanceMap.get(selectedInstance)?.harness_type ?? '';
    }, [selectedInstance, instances.instanceMap]);
    useEffect(() => {
        if (selectedInstance || instances.loading)
            return;
        const lastInstanceId = bridgePrefs.prefs.last_instance_id;
        if (lastInstanceId && instances.instanceMap.has(lastInstanceId)) {
            setSelectedInstance(lastInstanceId);
        }
        else {
            const first = instances.instances.find(i => i.enabled);
            if (first)
                setSelectedInstance(first.id);
        }
    }, [bridgePrefs.prefs.last_instance_id, selectedInstance, instances.instances, instances.instanceMap, instances.loading]);
    // Bootstrap one workspace from the last-selected session on first ready render.
    useEffect(() => {
        if (bootstrappedRef.current)
            return;
        if (!selectedInstance)
            return;
        const lastId = bridgePrefs.getLastSession(selectedInstance);
        bootstrappedRef.current = true;
        if (lastId) {
            const ws = makeWorkspace(lastId);
            setWorkspaces([ws]);
            setFocusedWorkspaceId(ws.id);
        }
    }, [selectedInstance, bridgePrefs]);
    useEffect(() => {
        apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => { });
    }, [apiFetch, basePath]);
    const getDisplayName = useCallback((session) => {
        if (session.display_name)
            return session.display_name;
        if (session.agent_id)
            return session.agent_id;
        return generateDefaultAgent(session.harness);
    }, []);
    const selectInstance = useCallback((instanceId) => {
        setSelectedInstance(instanceId);
        bridgePrefs.setLastInstanceId(instanceId);
    }, [bridgePrefs]);
    const handleCreate = useCallback(async () => {
        if (!selectedInstance || !selectedHarness)
            return;
        const frontendId = generateFrontendId();
        const agentId = generateDefaultAgent(selectedHarness);
        const sess = await bridge.createSession({
            harness: selectedHarness,
            instanceId: selectedInstance,
            agentId,
            displayName: '',
            clientId: frontendId,
        });
        if (sess) {
            bridgePrefs.setLastSession(selectedInstance, sess.bridge_id);
            const defaults = bridgePrefs.getDefaults(selectedHarness);
            if (defaults.model || defaults.effort || defaults.max_budget || defaults.disabled_tools?.length) {
                bridge.sendConfig({
                    model: defaults.model,
                    effort: defaults.effort,
                    max_budget: defaults.max_budget,
                    disabled_tools: defaults.disabled_tools,
                });
            }
            spawnWorkspace(sess.bridge_id);
        }
    }, [bridge, bridgePrefs, selectedInstance, selectedHarness, spawnWorkspace]);
    const harnessAvailable = useMemo(() => {
        if (!selectedHarness)
            return false;
        return harnesses.find(h => h.name === selectedHarness)?.available ?? false;
    }, [harnesses, selectedHarness]);
    const filteredSessions = useMemo(() => bridge.sessions.filter(s => s.instance_id === selectedInstance), [bridge.sessions, selectedInstance]);
    const handleRenameSession = useCallback((id, name) => {
        bridge.renameSession(id, name);
    }, [bridge]);
    const handleCreateInstance = useCallback(async (data) => {
        const inst = await instances.createInstance(data);
        if (inst) {
            setSelectedInstance(inst.id);
            bridgePrefs.setLastInstanceId(inst.id);
        }
        setShowNewInstance(false);
    }, [instances, bridgePrefs]);
    const currentInstanceName = useMemo(() => {
        if (!selectedInstance)
            return '';
        return instances.instanceMap.get(selectedInstance)?.name ?? '';
    }, [selectedInstance, instances.instanceMap]);
    const openSessionIds = useMemo(() => new Set(workspaces.map(w => w.sessionId).filter((id) => !!id)), [workspaces]);
    const focusedSessionId = useMemo(() => {
        const ws = workspaces.find(w => w.id === focusedWorkspaceId);
        return ws?.sessionId ?? null;
    }, [workspaces, focusedWorkspaceId]);
    return (_jsxs("div", { className: `bc-container ${collapseState.harnessBar ? 'bc-harness-collapsed' : ''} ${collapseState.sessionList ? 'bc-sidebar-collapsed' : ''}`, children: [collapseState.harnessBar ? (_jsx("div", { className: "htb-wrapper htb-wrapper-collapsed", children: _jsxs("button", { className: "htb-expand-btn", onClick: toggleHarnessBar, title: "Expand harness bar", "aria-label": "Expand harness bar", children: [_jsx("span", { className: "htb-expand-chevron", children: "\u25BE" }), _jsxs("span", { className: "htb-expand-label", children: ["Harness: ", currentInstanceName || 'none selected'] })] }) })) : (_jsx(HarnessTabBar, { instances: instances.instances, harnesses: harnesses, sessions: bridge.sessions, selectedInstance: selectedInstance, onSelect: selectInstance, onNewInstance: () => setShowNewInstance(true), basePath: basePath, instancesPath: routes.instances, onToggleCollapse: toggleHarnessBar })), _jsxs("div", { className: "bc-main", children: [collapseState.sessionList ? (_jsxs("button", { className: "bc-sidebar-strip", onClick: toggleSessionList, title: "Show sessions", "aria-label": "Show sessions", children: [_jsx("span", { className: "bc-sidebar-strip-chevron", children: "\u25B8" }), _jsx("span", { className: "bc-sidebar-strip-label", children: "Sessions" })] })) : (_jsx(SessionList, { sessions: filteredSessions, openSessionIds: openSessionIds, focusedSessionId: focusedSessionId, onSelect: handleSelectSession, onSpawnWorkspace: spawnWorkspace, onNewSession: handleCreate, connected: bridge.connected && harnessAvailable, getDisplayName: getDisplayName, onRename: handleRenameSession, folders: folders, onAfterFolderChange: bridge.refreshSessions, onToggleCollapse: toggleSessionList })), _jsx("div", { className: "bc-workspaces", children: workspaces.length === 0 ? (_jsx("div", { className: "bc-workspaces-empty", children: _jsx("div", { className: "bc-workspaces-empty-hint", children: "No workspaces open. Pick a session from the sidebar (or use the + button next to one) to open one." }) })) : (workspaces.map(w => (_jsx(Workspace, { workspace: w, focused: w.id === focusedWorkspaceId, onFocus: () => setFocusedWorkspaceId(w.id), onUpdate: fn => updateWorkspace(w.id, fn), onClose: () => closeWorkspace(w.id), harnesses: harnesses, storeModels: storeModels, instanceMap: instances.instanceMap, bridgePrefs: {
                                getDefaults: bridgePrefs.getDefaults,
                                setHarnessDefaults: bridgePrefs.setHarnessDefaults,
                                setLastSession: bridgePrefs.setLastSession,
                            } }, w.id)))) })] }), showNewInstance && (_jsx(NewInstanceForm, { harnesses: harnesses, onCreate: handleCreateInstance, onCancel: () => setShowNewInstance(false) }))] }));
}
//# sourceMappingURL=BridgeChat.js.map