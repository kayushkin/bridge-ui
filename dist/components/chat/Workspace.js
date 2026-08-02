import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBridgeConfig } from '../../context';
import { useBridgeSession } from '../../useBridgeSession';
import { formatTokens } from '../../utils';
import { BudgetCeilingBanner } from './BudgetCeilingBanner';
import { Composer } from './Composer';
import { LayoutRenderer } from './LayoutRenderer';
import { PendingPermissionsBanner } from './PendingPermissionsBanner';
import { SessionPermissionMode } from './SessionPermissionMode';
import { SessionHeader } from './SessionHeader';
import { StatusDot } from './StatusDot';
import { SystemPromptModal } from './SystemPromptModal';
import { ToolsPanel } from './ToolsPanel';
import { harnessIsWorkingOnTurn, sessionCanBeResumed } from './utils';
import { WorkspaceProvider } from './WorkspaceContext';
import { useMinimalChrome } from '../minimal/MinimalChromeContext';
// Returns the PaneKey leaves of the split that contains `key` as a direct child,
// so togglePane can reset just that sibling group without disturbing other splits.
function findPaneSplitGroup(node, key) {
    if (node.kind === 'leaf')
        return null;
    const directLeafKeys = node.children.flatMap(c => c.kind === 'leaf' ? [c.viewType] : []);
    if (directLeafKeys.includes(key))
        return directLeafKeys;
    for (const c of node.children) {
        if (c.kind === 'split') {
            const sub = findPaneSplitGroup(c, key);
            if (sub)
                return sub;
        }
    }
    return null;
}
export function Workspace({ workspace, focused, onFocus, onUpdate, onClose, onMarkDone, onStartPending, harnesses, instances, machines, storeModels, bridgePrefs }) {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const { minimal, controlsSlot, mobilePane } = useMinimalChrome();
    const bridge = useBridgeSession();
    const [activeChat, setActiveChat] = useState(null);
    const [configModel, setConfigModel] = useState('');
    const [configEffort, setConfigEffort] = useState('');
    const [showSystemPrompt, setShowSystemPrompt] = useState(false);
    const [showTools, setShowTools] = useState(false);
    const pendingConfigRef = useRef(null);
    // Git repos discovered for the active session — fetched once at workspace
    // level so SessionHeader's selector and GitPanel share the same selection.
    // Refetched on session swap, on every turn boundary (uiState flip), and on
    // explicit refresh.
    const [gitRepos, setGitRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState('');
    const [gitReposLoading, setGitReposLoading] = useState(false);
    const [gitReposError, setGitReposError] = useState(null);
    const [gitRefreshTick, setGitRefreshTick] = useState(0);
    const refreshGitRepos = useCallback(() => setGitRefreshTick(t => t + 1), []);
    const sessionId = bridge.activeSession?.session_id;
    useEffect(() => {
        if (!sessionId) {
            setGitRepos([]);
            setGitReposError(null);
            return;
        }
        let cancelled = false;
        setGitReposLoading(true);
        setGitReposError(null);
        apiFetch(`${basePath}/sessions/${sessionId}/git/repos`)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(`${r.status} ${await r.text()}`);
            return r.json();
        })
            .then(data => { if (!cancelled)
            setGitRepos(data.repos || []); })
            .catch(err => {
            if (cancelled)
                return;
            setGitReposError(`repos: ${err instanceof Error ? err.message : String(err)}`);
            setGitRepos([]);
        })
            .finally(() => { if (!cancelled)
            setGitReposLoading(false); });
        return () => { cancelled = true; };
    }, [sessionId, bridge.uiState, gitRefreshTick, apiFetch, basePath]);
    useEffect(() => {
        if (gitRepos.length === 0) {
            setSelectedRepo('');
            return;
        }
        if (!selectedRepo || !gitRepos.find(r => r.path === selectedRepo)) {
            setSelectedRepo(gitRepos[0].path);
        }
    }, [gitRepos, selectedRepo]);
    // Bind this workspace's bridge instance to its assigned session id.
    useEffect(() => {
        const target = workspace.sessionId ?? '';
        if (bridge.activeSession?.session_id !== target) {
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
        const agent = sess.agent_id || '';
        setActiveChat({
            sessionId: sess.session_id,
            harness: sess.harness,
            agent,
            displayName: sess.display_name || agent,
        });
    }, [bridge.activeSession]);
    // A pending (unstarted) pane has no active session, so fall back to the
    // harness recorded on its pending marker. This lets harnessDefaults /
    // capabilities / harnessModels resolve before the session exists, so the
    // model & effort controls can render for a pending chat.
    const activeHarness = activeChat?.harness ?? workspace.pending?.harness ?? '';
    // Server-registered HarnessInfo for the active harness — single source
    // of truth for label / emoji / image / tint. No client-side fallbacks;
    // missing fields mean the server registration needs fixing.
    const activeHarnessInfo = useMemo(() => activeHarness ? harnesses.find(h => h.name === activeHarness) : undefined, [harnesses, activeHarness]);
    // Resolve the machine the active session is running on — header chip
    // shows machine name + emoji + reachability so users know which host
    // is doing the work.
    const activeInstanceID = bridge.activeSession?.instance_id;
    const activeMachine = useMemo(() => {
        if (!activeInstanceID)
            return undefined;
        const inst = instances.find(i => i.id === activeInstanceID);
        if (!inst)
            return undefined;
        return machines.find(m => m.id === inst.machine_id);
    }, [instances, machines, activeInstanceID]);
    // Pending (unstarted) new chat: a live composer with no server session yet.
    // The session is created on the first send (handleSend below). Only true
    // while there is no active session bound.
    const isPending = !!workspace.pending && !bridge.activeSession;
    const pendingHarnessInfo = useMemo(() => workspace.pending ? harnesses.find(h => h.name === workspace.pending.harness) : undefined, [harnesses, workspace.pending]);
    const pendingMachine = useMemo(() => {
        if (!workspace.pending)
            return undefined;
        const inst = instances.find(i => i.id === workspace.pending.instanceId);
        if (!inst)
            return undefined;
        return machines.find(m => m.id === inst.machine_id);
    }, [instances, machines, workspace.pending]);
    // Header chrome: a synthesized "New chat" descriptor for a pending pane so
    // the harness/machine chips render before the session exists.
    const headerChat = activeChat ?? (isPending
        ? { sessionId: null, harness: workspace.pending.harness, agent: '', displayName: 'New chat' }
        : null);
    const headerHarnessInfo = activeHarnessInfo ?? (isPending ? pendingHarnessInfo : undefined);
    const headerMachine = activeMachine ?? (isPending ? pendingMachine : undefined);
    // Per-instance reachability for the header dot. Polled in line with
    // the rest of the header — cheap, and the API already aggregates
    // local/SSH/runner liveness behind a single bool.
    const [activeReachable, setActiveReachable] = useState(null);
    useEffect(() => {
        if (!activeInstanceID) {
            setActiveReachable(null);
            return;
        }
        let cancelled = false;
        const check = async () => {
            try {
                const res = await apiFetch(`${basePath}/instances/${activeInstanceID}/status`);
                if (!res.ok) {
                    if (!cancelled)
                        setActiveReachable(null);
                    return;
                }
                const data = await res.json();
                if (!cancelled)
                    setActiveReachable(Boolean(data?.reachable));
            }
            catch {
                if (!cancelled)
                    setActiveReachable(null);
            }
        };
        check();
        const t = setInterval(check, 15000);
        return () => { cancelled = true; clearInterval(t); };
    }, [apiFetch, basePath, activeInstanceID]);
    const harnessDefaults = useMemo(() => activeHarness ? bridgePrefs.getDefaults(activeHarness) : {}, [bridgePrefs, activeHarness]);
    // Pre-populate model/effort with the harness's saved defaults so the user
    // sees what will actually be used instead of placeholder labels.
    useEffect(() => {
        setConfigModel(harnessDefaults.model ?? '');
        setConfigEffort(harnessDefaults.effort ?? '');
    }, [harnessDefaults.model, harnessDefaults.effort]);
    useEffect(() => {
        const changed = {};
        if (configModel && configModel !== harnessDefaults.model)
            changed.model = configModel;
        if (configEffort && configEffort !== harnessDefaults.effort)
            changed.effort = configEffort;
        pendingConfigRef.current = (changed.model || changed.effort) ? changed : null;
    }, [configModel, configEffort, harnessDefaults.model, harnessDefaults.effort]);
    const togglePane = useCallback((key) => {
        onUpdate(w => {
            const group = findPaneSplitGroup(w.layout, key) ?? [key];
            const paneSizes = { ...w.paneSizes };
            for (const k of group)
                paneSizes[k] = 1;
            return {
                ...w,
                panesHidden: { ...w.panesHidden, [key]: !w.panesHidden[key] },
                paneSizes,
            };
        });
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
        const id = bridge.activeSession?.session_id;
        if (!id)
            return -1;
        return navOrder.findIndex(s => s.session_id === id);
    }, [navOrder, bridge.activeSession]);
    const handlePrevSession = useCallback(() => {
        if (navIndex <= 0)
            return;
        const target = navOrder[navIndex - 1];
        onUpdate(w => ({ ...w, sessionId: target.session_id }));
        if (instanceId)
            bridgePrefs.setLastSession(instanceId, target.session_id);
    }, [navIndex, navOrder, instanceId, onUpdate, bridgePrefs]);
    const handleNextSession = useCallback(() => {
        if (navIndex < 0 || navIndex >= navOrder.length - 1)
            return;
        const target = navOrder[navIndex + 1];
        onUpdate(w => ({ ...w, sessionId: target.session_id }));
        if (instanceId)
            bridgePrefs.setLastSession(instanceId, target.session_id);
    }, [navIndex, navOrder, instanceId, onUpdate, bridgePrefs]);
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
    const contextInfo = useMemo(() => {
        for (let i = bridge.logRows.length - 1; i >= 0; i--) {
            const r = bridge.logRows[i];
            if (r.actor === 'assistant' && r.done && r.meta?.usage) {
                const tokens = r.meta.usage.context_tokens ?? 0;
                const limit = r.meta.usage.context_limit ?? 0;
                const pct = tokens && limit ? Math.min(100, Math.round((tokens / limit) * 100)) : 0;
                return { tokens, limit, pct };
            }
        }
        return { tokens: 0, limit: 0, pct: 0 };
    }, [bridge.logRows]);
    const contextTone = contextInfo.pct >= 90 ? 'crit' : contextInfo.pct >= 70 ? 'warn' : '';
    const handleSend = useCallback(async (text) => {
        // Pending new chat: create the real server session now, on the first send,
        // then route the message to it. The session is created with the harness's
        // saved defaults (model / effort / budget / disabled tools), matching what
        // the eager New-Session path used to apply.
        if (workspace.pending && !bridge.activeSession) {
            const { instanceId, harness } = workspace.pending;
            const sess = await bridge.createSession({ harness, instance_id: instanceId, display_name: '' });
            if (!sess)
                return;
            onStartPending?.(instanceId, sess.session_id);
            const defaults = bridgePrefs.getDefaults(harness);
            // A pending chat can pick model / effort in the controls bar before the
            // first send; that choice lives in pendingConfigRef. Apply it over the
            // saved defaults so the selection is honored, and persist it as the new
            // default like the running-session path below.
            const override = pendingConfigRef.current;
            const model = override?.model ?? defaults.model;
            const effort = override?.effort ?? defaults.effort;
            if (model || effort || defaults.max_budget || defaults.disabled_tools?.length) {
                bridge.sendConfig({
                    model,
                    effort,
                    max_budget: defaults.max_budget,
                    disabled_tools: defaults.disabled_tools,
                }, sess.session_id);
            }
            if (override) {
                bridgePrefs.setHarnessDefaults(harness, override);
                pendingConfigRef.current = null;
            }
            // Bind the pane to the new session and drop its pending marker.
            onUpdate(w => ({ ...w, sessionId: sess.session_id, pending: undefined }));
            bridge.send(text, sess.session_id);
            return;
        }
        if (pendingConfigRef.current) {
            bridge.sendConfig(pendingConfigRef.current);
            if (activeHarness) {
                bridgePrefs.setHarnessDefaults(activeHarness, pendingConfigRef.current);
            }
            pendingConfigRef.current = null;
        }
        // Interrupt first, then send: the two race otherwise and the new message can
        // reach the harness while the old turn still owns it. `harnessIsWorkingOnTurn`
        // is what says a turn is in flight — the `uiState === 'running'` this used to
        // test is never true (derivation projects the deprecated `running` to
        // `tool_running`), so the interrupt never fired and Send's own title, which
        // promises it, was a lie.
        if (harnessIsWorkingOnTurn(bridge.uiState))
            await bridge.interrupt();
        bridge.send(text);
    }, [bridge, bridgePrefs, activeHarness, workspace.pending, onStartPending, onUpdate]);
    const handleRename = useCallback((name) => {
        if (activeChat?.sessionId)
            bridge.renameSession(activeChat.sessionId, name);
    }, [bridge, activeChat]);
    // Model & effort are pre-start settings, so they render for a pending chat
    // (no active session yet) as well as a running one. The remaining controls
    // act on a live session and stay gated on bridge.activeSession.
    const showConfigControls = !!bridge.activeSession || isPending;
    const controlsBar = (_jsxs("div", { className: "bc-controls-bar", children: [bridge.activeSession && (_jsxs(_Fragment, { children: [_jsx(StatusChip, { uiState: bridge.uiState, activity: bridge.activity, compacting: bridge.compacting }), activeHarnessInfo?.pty && (_jsx(ModeToggle, { currentMode: bridge.activeSession.mode, busy: harnessIsWorkingOnTurn(bridge.uiState), onSwitch: mode => bridge.switchMode(bridge.activeSession.session_id, mode) }))] })), showConfigControls && capabilities.has('model') && harnessModels.length > 0 && (_jsxs("select", { className: "bc-ctrl-select", value: configModel, onChange: e => setConfigModel(e.target.value), title: "Model", children: [_jsx("option", { value: "", children: "Model" }), harnessModels.map(m => _jsx("option", { value: m.value, children: m.label }, m.value))] })), showConfigControls && capabilities.has('effort') && (_jsxs("select", { className: "bc-ctrl-select", value: configEffort, onChange: e => setConfigEffort(e.target.value), title: "Effort", children: [_jsx("option", { value: "", children: "Effort" }), _jsx("option", { value: "low", children: "Low" }), _jsx("option", { value: "medium", children: "Medium" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "xhigh", children: "XHigh" }), _jsx("option", { value: "max", children: "Max" })] })), bridge.activeSession && (_jsxs(_Fragment, { children: [capabilities.has('compact') && (_jsxs("button", { className: `bc-ctrl-btn bc-ctrl-btn-compact${contextTone ? ` bc-ctrl-btn-compact-${contextTone}` : ''}`, onClick: handleCompact, title: contextInfo.tokens && contextInfo.limit
                            ? `Compact context — ${formatTokens(contextInfo.tokens)} / ${formatTokens(contextInfo.limit)} (${contextInfo.pct}%)`
                            : 'Compact context', style: { ['--ctx-pct']: `${contextInfo.pct}%` }, children: [_jsx("span", { className: "bc-ctrl-btn-bar", "aria-hidden": true }), _jsxs("span", { className: "bc-ctrl-btn-text", children: ["Compact", contextInfo.pct > 0 ? ` ${contextInfo.pct}%` : ''] })] })), capabilities.has('fork') && (_jsx("button", { className: "bc-ctrl-btn", onClick: handleFork, title: "Fork session", children: "Fork" })), capabilities.has('system_prompt') && (_jsx("button", { className: "bc-ctrl-btn", onClick: () => setShowSystemPrompt(true), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'View system prompt' : 'System prompt will be available after the session starts', children: "System Prompt" })), capabilities.has('tools') && (_jsxs("button", { className: `bc-ctrl-btn ${showTools ? 'bc-ctrl-btn-active' : ''}`, onClick: () => setShowTools(s => !s), disabled: !bridge.activeSession.info, title: bridge.activeSession.info ? 'Toggle available tools' : 'Tools will be available after the session starts', children: ["Tools", bridge.activeSession.info?.tools?.length ? ` (${bridge.activeSession.info.tools.length})` : ''] })), _jsx(SessionPermissionMode, { session: bridge.activeSession, harnesses: harnesses })] }))] }));
    // In minimal mode, the focused workspace's controls go into the bottom
    // sheet via a portal. Non-focused workspaces hide their controls
    // entirely on mobile (only the focused one is reachable). In normal
    // mode every workspace renders its controls inline.
    const renderControls = (() => {
        if (!minimal)
            return controlsBar;
        if (focused && controlsSlot)
            return createPortal(controlsBar, controlsSlot);
        return null;
    })();
    return (_jsxs("div", { className: `bc-workspace${focused ? ' bc-workspace-focused' : ''}${minimal ? ' bc-workspace-minimal' : ''}`, onMouseDownCapture: onFocus, onFocusCapture: onFocus, children: [!minimal && _jsx(SessionHeader, { chat: headerChat, session: bridge.activeSession, harnessInfo: headerHarnessInfo, machine: headerMachine, machineReachable: activeReachable, basePath: basePath, uiState: bridge.uiState, rows: bridge.logRows, onRename: handleRename, onPrev: handlePrevSession, onNext: handleNextSession, hasPrev: navIndex > 0, hasNext: navIndex >= 0 && navIndex < navOrder.length - 1, panesHidden: workspace.panesHidden, onToggleTurns: () => togglePane('turns'), onToggleThread: () => togglePane('thread'), onToggleTimeline: () => togglePane('timeline'), onToggleGit: () => togglePane('git'), onToggleKanban: () => togglePane('kanban'), onToggleOrchestrator: () => togglePane('orchestrator'), onToggleAttach: () => togglePane('attach'), attachAvailable: bridge.activeSession?.mode === 'pty', onMarkDone: onMarkDone && bridge.activeSession
                    ? (done) => onMarkDone(bridge.activeSession.session_id, done)
                    : undefined, onCloseWorkspace: onClose, gitRepos: gitRepos, selectedRepo: selectedRepo, onSelectRepo: setSelectedRepo }), _jsxs(WorkspaceProvider, { value: {
                    chat: activeChat,
                    rows: bridge.logRows,
                    loading: bridge.loadingHistory,
                    uiState: bridge.uiState,
                    activity: bridge.activity,
                    error: bridge.error,
                    compacting: bridge.compacting,
                    sessionMode: bridge.activeSession?.mode,
                    attachToken: bridge.activeSession ? bridge.attachTokens[bridge.activeSession.session_id] : undefined,
                    refreshAttachToken: bridge.refreshAttachToken,
                    // In minimal (mobile) mode, force the per-workspace pane state to
                    // show only the user's currently-selected mobilePane. The
                    // workspace's persisted panesHidden/layout are left untouched —
                    // the user keeps their split layout when they return to full mode.
                    panesHidden: minimal
                        ? { turns: mobilePane !== 'turns', thread: mobilePane !== 'thread', timeline: mobilePane !== 'timeline', git: mobilePane !== 'git', kanban: mobilePane !== 'kanban', orchestrator: mobilePane !== 'orchestrator', attach: mobilePane !== 'attach' }
                        : workspace.panesHidden,
                    paneSizes: workspace.paneSizes,
                    togglePane,
                    setPaneSizes,
                    gitRepos,
                    selectedRepo,
                    setSelectedRepo,
                    gitReposLoading,
                    gitReposError,
                    refreshGitRepos,
                    pendingHooks: bridge.pendingHooks,
                    resolveHook: bridge.resolveHook,
                }, children: [_jsx(PendingPermissionsBanner, {}), _jsx(BudgetCeilingBanner, { halt: bridge.budgetHalt?.sessionId === bridge.activeSession?.session_id ? bridge.budgetHalt : null, session: bridge.activeSession, onRaiseCeiling: bridge.raiseBudgetCeiling }), _jsx(LayoutRenderer, { tree: minimal ? { kind: 'leaf', viewType: mobilePane } : workspace.layout })] }), renderControls, showTools && bridge.activeSession?.info && _jsx(ToolsPanel, { info: bridge.activeSession.info }), _jsx(Composer, { sessionId: bridge.activeSession?.session_id ?? (isPending ? workspace.id : null), connected: (bridge.connected && !!bridge.activeSession) || isPending, turnRunning: harnessIsWorkingOnTurn(bridge.uiState), resumable: sessionCanBeResumed(bridge.uiState), onSend: handleSend, onStop: bridge.interrupt, onResume: bridge.resume }), showSystemPrompt && bridge.activeSession?.info && (_jsx(SystemPromptModal, { info: bridge.activeSession.info, onClose: () => setShowSystemPrompt(false) }))] }));
}
// ModeToggle surfaces the events/pty mode switcher for harnesses that
// support pty. Disabled while a turn is in flight — switching mid-
// generation would lose the partial response (the server enforces this
// too, but we disable the button so the user gets immediate feedback).
function ModeToggle({ currentMode, busy, onSwitch }) {
    const isPty = currentMode === 'pty';
    const target = isPty ? 'events' : 'pty';
    return (_jsxs("button", { className: `bc-ctrl-btn bc-ctrl-btn-mode${isPty ? ' bc-ctrl-btn-mode-pty' : ''}`, onClick: () => onSwitch(target), disabled: busy, title: busy ? 'Cannot switch mode mid-turn' : `Switch to ${target} mode`, children: ["Mode: ", isPty ? 'pty' : 'events'] }));
}
function StatusChip({ uiState, activity, compacting }) {
    if (compacting) {
        return (_jsxs("span", { className: "bc-status-chip bc-status-chip-compacting", children: [_jsx(StatusDot, { state: "compacting" }), _jsx("span", { className: "bc-status-chip-label", children: "Compacting" })] }));
    }
    if (!uiState || uiState === 'empty')
        return null;
    const stateLabel = uiState.charAt(0).toUpperCase() + uiState.slice(1);
    // Same dead comparison as the composer's: `running` never reaches a consumer,
    // so the chip's "· thinking" / "· tool" suffix had never rendered either.
    const activityText = activity.kind !== 'idle' && harnessIsWorkingOnTurn(uiState)
        ? (activity.kind === 'tool' ? activity.name ?? 'tool' : activity.kind === 'thinking' ? 'thinking' : 'streaming')
        : '';
    return (_jsxs("span", { className: `bc-status-chip bc-status-chip-${uiState}`, children: [_jsx(StatusDot, { state: uiState }), _jsx("span", { className: "bc-status-chip-label", children: stateLabel }), activityText && _jsxs("span", { className: "bc-status-chip-activity", children: ["\u00B7 ", activityText] })] }));
}
//# sourceMappingURL=Workspace.js.map