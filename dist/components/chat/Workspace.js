import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeSession } from '../../useBridgeSession';
import { Composer } from './Composer';
import { LayoutRenderer } from './LayoutRenderer';
import { SessionHeader } from './SessionHeader';
import { SystemPromptModal } from './SystemPromptModal';
import { ToolsPanel } from './ToolsPanel';
import { WorkspaceProvider } from './WorkspaceContext';
import { generateDefaultAgent } from './utils';
export function Workspace({ workspace, focused, onFocus, onUpdate, onClose, harnesses, storeModels, bridgePrefs }) {
    const bridge = useBridgeSession();
    const [activeChat, setActiveChat] = useState(null);
    const [configModel, setConfigModel] = useState('');
    const [configEffort, setConfigEffort] = useState('');
    const [showSystemPrompt, setShowSystemPrompt] = useState(false);
    const [showTools, setShowTools] = useState(false);
    const pendingConfigRef = useRef(null);
    // Bind this workspace's bridge instance to its assigned session id.
    useEffect(() => {
        const target = workspace.sessionId ?? '';
        if (bridge.activeSession?.bridge_id !== target) {
            bridge.selectSession(target);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace.sessionId]);
    useEffect(() => {
        const sess = bridge.activeSession;
        if (!sess) {
            setActiveChat(null);
            return;
        }
        const agent = sess.agent_id ? sess.agent_id : generateDefaultAgent(sess.harness);
        setActiveChat({
            frontendId: sess.client_id || `fe_${sess.bridge_id}`,
            sessionId: sess.bridge_id,
            harness: sess.harness,
            agent,
            displayName: sess.display_name || agent,
        });
    }, [bridge.activeSession]);
    useEffect(() => {
        const config = {};
        if (configModel)
            config.model = configModel;
        if (configEffort)
            config.effort = configEffort;
        pendingConfigRef.current = (configModel || configEffort) ? config : null;
    }, [configModel, configEffort]);
    const togglePane = useCallback((key) => {
        onUpdate(w => ({ ...w, panesHidden: { ...w.panesHidden, [key]: !w.panesHidden[key] } }));
    }, [onUpdate]);
    const setPaneSizes = useCallback((updater) => {
        onUpdate(w => ({ ...w, paneSizes: typeof updater === 'function' ? updater(w.paneSizes) : updater }));
    }, [onUpdate]);
    // Same-instance session list, sorted newest-first, drives workspace nav arrows.
    const instanceId = bridge.activeSession?.instance_id;
    const navOrder = useMemo(() => {
        if (!instanceId)
            return [];
        return [...bridge.sessions]
            .filter(s => s.instance_id === instanceId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }, [bridge.sessions, instanceId]);
    const navIndex = useMemo(() => {
        const id = bridge.activeSession?.bridge_id;
        if (!id)
            return -1;
        return navOrder.findIndex(s => s.bridge_id === id);
    }, [navOrder, bridge.activeSession]);
    const handlePrevSession = useCallback(() => {
        if (navIndex <= 0)
            return;
        const target = navOrder[navIndex - 1];
        onUpdate(w => ({ ...w, sessionId: target.bridge_id }));
        if (instanceId)
            bridgePrefs.setLastSession(instanceId, target.bridge_id);
    }, [navIndex, navOrder, instanceId, onUpdate, bridgePrefs]);
    const handleNextSession = useCallback(() => {
        if (navIndex < 0 || navIndex >= navOrder.length - 1)
            return;
        const target = navOrder[navIndex + 1];
        onUpdate(w => ({ ...w, sessionId: target.bridge_id }));
        if (instanceId)
            bridgePrefs.setLastSession(instanceId, target.bridge_id);
    }, [navIndex, navOrder, instanceId, onUpdate, bridgePrefs]);
    const activeHarness = activeChat?.harness ?? '';
    const capabilities = useMemo(() => {
        const info = harnesses.find(h => h.name === activeHarness);
        return new Set(info?.capabilities ?? []);
    }, [harnesses, activeHarness]);
    const harnessModels = useMemo(() => {
        const harness = harnesses.find(h => h.name === activeHarness);
        const providers = harness?.supported_providers;
        const filtered = providers?.length ? storeModels.filter(m => providers.includes(m.provider)) : storeModels;
        return filtered.map(m => ({ value: m.id, label: `${m.name || m.id} ($${m.input_cost}/$${m.output_cost})` }));
    }, [storeModels, harnesses, activeHarness]);
    const handleCompact = useCallback(() => bridge.compact(), [bridge]);
    const handleFork = useCallback(() => bridge.fork(), [bridge]);
    const handleSend = useCallback((text) => {
        if (pendingConfigRef.current) {
            bridge.sendConfig(pendingConfigRef.current);
            if (activeHarness) {
                bridgePrefs.setHarnessDefaults(activeHarness, pendingConfigRef.current);
            }
            pendingConfigRef.current = null;
        }
        bridge.send(text);
    }, [bridge, bridgePrefs, activeHarness]);
    const handleRename = useCallback((name) => {
        if (activeChat?.sessionId)
            bridge.renameSession(activeChat.sessionId, name);
    }, [bridge, activeChat]);
    return (_jsxs("div", { className: `bc-workspace${focused ? ' bc-workspace-focused' : ''}`, onMouseDownCapture: onFocus, onFocusCapture: onFocus, children: [_jsx(SessionHeader, { chat: activeChat, uiState: bridge.uiState, rows: bridge.logRows, onRename: handleRename, onPrev: handlePrevSession, onNext: handleNextSession, hasPrev: navIndex > 0, hasNext: navIndex >= 0 && navIndex < navOrder.length - 1, panesHidden: workspace.panesHidden, onToggleTurns: () => togglePane('turns'), onToggleThread: () => togglePane('thread'), onToggleTimeline: () => togglePane('timeline'), onToggleGit: () => togglePane('git'), onCloseWorkspace: onClose }), _jsx(WorkspaceProvider, { value: {
                    chat: activeChat,
                    rows: bridge.logRows,
                    loading: bridge.loadingHistory,
                    uiState: bridge.uiState,
                    activity: bridge.activity,
                    error: bridge.error,
                    panesHidden: workspace.panesHidden,
                    paneSizes: workspace.paneSizes,
                    togglePane,
                    setPaneSizes,
                }, children: _jsx(LayoutRenderer, { tree: workspace.layout }) }), _jsx("div", { className: "bc-controls-bar", children: bridge.activeSession && (_jsxs(_Fragment, { children: [capabilities.has('model') && harnessModels.length > 0 && (_jsxs("select", { className: "bc-ctrl-select", value: configModel, onChange: e => setConfigModel(e.target.value), title: "Model", children: [_jsx("option", { value: "", children: "Model" }), harnessModels.map(m => _jsx("option", { value: m.value, children: m.label }, m.value))] })), capabilities.has('effort') && (_jsxs("select", { className: "bc-ctrl-select", value: configEffort, onChange: e => setConfigEffort(e.target.value), title: "Effort", children: [_jsx("option", { value: "", children: "Effort" }), _jsx("option", { value: "low", children: "Low" }), _jsx("option", { value: "medium", children: "Medium" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "xhigh", children: "XHigh" }), _jsx("option", { value: "max", children: "Max" })] })), capabilities.has('compact') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleCompact, title: "Compact context", children: "Compact" })), capabilities.has('fork') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleFork, title: "Fork session", children: "Fork" })), capabilities.has('system_prompt') && (_jsx("button", { className: "bc-ctrl-btn", onClick: () => setShowSystemPrompt(true), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'View system prompt' : 'System prompt will be available after the session starts', children: "System Prompt" })), capabilities.has('tools') && (_jsxs("button", { className: `bc-ctrl-btn ${showTools ? 'bc-ctrl-btn-active' : ''}`, onClick: () => setShowTools(s => !s), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'Toggle available tools' : 'Tools will be available after the session starts', children: ["Tools", bridge.activeSession.info?.tools?.length ? ` (${bridge.activeSession.info.tools.length})` : ''] }))] })) }), showTools && bridge.activeSession?.info && _jsx(ToolsPanel, { info: bridge.activeSession.info }), _jsx(Composer, { connected: bridge.connected && !!bridge.activeSession, streaming: bridge.uiState === 'running', paused: bridge.uiState === 'paused', uiState: bridge.uiState, activity: bridge.activity, onSend: handleSend, onStop: bridge.interrupt, onResume: bridge.resume }), showSystemPrompt && bridge.activeSession?.info && (_jsx(SystemPromptModal, { info: bridge.activeSession.info, onClose: () => setShowSystemPrompt(false) }))] }));
}
//# sourceMappingURL=Workspace.js.map