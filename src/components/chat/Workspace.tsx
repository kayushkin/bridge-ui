import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BridgeInstance, HarnessInfo, Machine, ManagedSession } from '../../types'
import { useBridgeConfig } from '../../context'
import { useBridgeSession } from '../../useBridgeSession'
import { formatTokens } from '../../utils'
import { Composer } from './Composer'
import { LayoutRenderer } from './LayoutRenderer'
import { PendingPermissionsBanner } from './PendingPermissionsBanner'
import { SessionBypassToggle } from './SessionBypassToggle'
import { SessionHeader } from './SessionHeader'
import { StatusDot } from './StatusDot'
import { SystemPromptModal } from './SystemPromptModal'
import { ToolsPanel } from './ToolsPanel'
import { WorkspaceProvider } from './WorkspaceContext'
import { useMinimalChrome } from '../minimal/MinimalChromeContext'
import type { GitRepo } from './WorkspaceContext'
import type { ChatSession, InnerNode, PaneKey, PaneSizes, StoreModel, WorkspaceState } from './types'

// Returns the PaneKey leaves of the split that contains `key` as a direct child,
// so togglePane can reset just that sibling group without disturbing other splits.
function findPaneSplitGroup(node: InnerNode, key: PaneKey): PaneKey[] | null {
  if (node.kind === 'leaf') return null
  const directLeafKeys = node.children.flatMap(c => c.kind === 'leaf' ? [c.viewType] : [])
  if (directLeafKeys.includes(key)) return directLeafKeys
  for (const c of node.children) {
    if (c.kind === 'split') {
      const sub = findPaneSplitGroup(c, key)
      if (sub) return sub
    }
  }
  return null
}

interface WorkspaceProps {
  workspace: WorkspaceState
  focused: boolean
  onFocus: () => void
  onUpdate: (fn: (w: WorkspaceState) => WorkspaceState) => void
  onClose?: () => void
  harnesses: HarnessInfo[]
  instances: BridgeInstance[]
  machines: Machine[]
  storeModels: StoreModel[]
  bridgePrefs: {
    getDefaults: (harness: string) => { model?: string; effort?: string; max_budget?: number; disabled_tools?: string[] }
    setHarnessDefaults: (harness: string, config: { model?: string; effort?: string; max_budget?: number; disabled_tools?: string[] }) => void
    setLastSession: (instanceId: string, sessionId: string) => void
  }
}

export function Workspace({ workspace, focused, onFocus, onUpdate, onClose, harnesses, instances, machines, storeModels, bridgePrefs }: WorkspaceProps) {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const { minimal, controlsSlot, mobilePane } = useMinimalChrome()
  const bridge = useBridgeSession()
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null)
  const [configModel, setConfigModel] = useState('')
  const [configEffort, setConfigEffort] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const pendingConfigRef = useRef<{ model?: string; effort?: string } | null>(null)

  // Git repos discovered for the active session — fetched once at workspace
  // level so SessionHeader's selector and GitPanel share the same selection.
  // Refetched on session swap, on every turn boundary (uiState flip), and on
  // explicit refresh.
  const [gitRepos, setGitRepos] = useState<GitRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [gitReposLoading, setGitReposLoading] = useState(false)
  const [gitReposError, setGitReposError] = useState<string | null>(null)
  const [gitRefreshTick, setGitRefreshTick] = useState(0)
  const refreshGitRepos = useCallback(() => setGitRefreshTick(t => t + 1), [])

  const sessionId = bridge.activeSession?.bridge_id
  useEffect(() => {
    if (!sessionId) {
      setGitRepos([])
      setGitReposError(null)
      return
    }
    let cancelled = false
    setGitReposLoading(true)
    setGitReposError(null)
    apiFetch(`${basePath}/sessions/${sessionId}/git/repos`)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
        return r.json() as Promise<{ repos: GitRepo[] }>
      })
      .then(data => { if (!cancelled) setGitRepos(data.repos || []) })
      .catch(err => {
        if (cancelled) return
        setGitReposError(`repos: ${err instanceof Error ? err.message : String(err)}`)
        setGitRepos([])
      })
      .finally(() => { if (!cancelled) setGitReposLoading(false) })
    return () => { cancelled = true }
  }, [sessionId, bridge.uiState, gitRefreshTick, apiFetch, basePath])

  useEffect(() => {
    if (gitRepos.length === 0) {
      setSelectedRepo('')
      return
    }
    if (!selectedRepo || !gitRepos.find(r => r.path === selectedRepo)) {
      setSelectedRepo(gitRepos[0].path)
    }
  }, [gitRepos, selectedRepo])

  // Bind this workspace's bridge instance to its assigned session id.
  useEffect(() => {
    const target = workspace.sessionId ?? ''
    if (bridge.activeSession?.bridge_id !== target) {
      bridge.selectSession(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.sessionId])

  useEffect(() => {
    const sess = bridge.activeSession
    if (!sess) {
      setActiveChat(null)
      return
    }
    const agent = sess.agent_id || ''
    setActiveChat({
      frontendId: sess.client_id || `fe_${sess.bridge_id}`,
      sessionId: sess.bridge_id,
      harness: sess.harness,
      agent,
      displayName: sess.display_name || agent,
    })
  }, [bridge.activeSession])

  const activeHarness = activeChat?.harness ?? ''
  // Server-registered HarnessInfo for the active harness — single source
  // of truth for label / emoji / image / tint. No client-side fallbacks;
  // missing fields mean the server registration needs fixing.
  const activeHarnessInfo = useMemo(
    () => activeHarness ? harnesses.find(h => h.name === activeHarness) : undefined,
    [harnesses, activeHarness]
  )

  // Resolve the machine the active session is running on — header chip
  // shows machine name + emoji + reachability so users know which host
  // is doing the work.
  const activeInstanceID = bridge.activeSession?.instance_id
  const activeMachine = useMemo(() => {
    if (!activeInstanceID) return undefined
    const inst = instances.find(i => i.id === activeInstanceID)
    if (!inst) return undefined
    return machines.find(m => m.id === inst.machine_id)
  }, [instances, machines, activeInstanceID])

  // Per-instance reachability for the header dot. Polled in line with
  // the rest of the header — cheap, and the API already aggregates
  // local/SSH/runner liveness behind a single bool.
  const [activeReachable, setActiveReachable] = useState<boolean | null>(null)
  useEffect(() => {
    if (!activeInstanceID) { setActiveReachable(null); return }
    let cancelled = false
    const check = async () => {
      try {
        const res = await apiFetch(`${basePath}/instances/${activeInstanceID}/status`)
        if (!res.ok) { if (!cancelled) setActiveReachable(null); return }
        const data = await res.json()
        if (!cancelled) setActiveReachable(Boolean(data?.reachable))
      } catch {
        if (!cancelled) setActiveReachable(null)
      }
    }
    check()
    const t = setInterval(check, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [apiFetch, basePath, activeInstanceID])
  const harnessDefaults = useMemo(
    () => activeHarness ? bridgePrefs.getDefaults(activeHarness) : {},
    [bridgePrefs, activeHarness]
  )

  // Pre-populate model/effort with the harness's saved defaults so the user
  // sees what will actually be used instead of placeholder labels.
  useEffect(() => {
    setConfigModel(harnessDefaults.model ?? '')
    setConfigEffort(harnessDefaults.effort ?? '')
  }, [harnessDefaults.model, harnessDefaults.effort])

  useEffect(() => {
    const changed: { model?: string; effort?: string } = {}
    if (configModel && configModel !== harnessDefaults.model) changed.model = configModel
    if (configEffort && configEffort !== harnessDefaults.effort) changed.effort = configEffort
    pendingConfigRef.current = (changed.model || changed.effort) ? changed : null
  }, [configModel, configEffort, harnessDefaults.model, harnessDefaults.effort])

  const togglePane = useCallback((key: PaneKey) => {
    onUpdate(w => {
      const group = findPaneSplitGroup(w.layout, key) ?? [key]
      const paneSizes = { ...w.paneSizes }
      for (const k of group) paneSizes[k] = 1
      return {
        ...w,
        panesHidden: { ...w.panesHidden, [key]: !w.panesHidden[key] },
        paneSizes,
      }
    })
  }, [onUpdate])

  const setPaneSizes = useCallback((updater: PaneSizes | ((prev: PaneSizes) => PaneSizes)) => {
    onUpdate(w => ({ ...w, paneSizes: typeof updater === 'function' ? (updater as (p: PaneSizes) => PaneSizes)(w.paneSizes) : updater }))
  }, [onUpdate])

  // Same-instance session list, sorted newest-first, drives workspace nav arrows.
  const instanceId = bridge.activeSession?.instance_id
  const navOrder = useMemo<ManagedSession[]>(() => {
    if (!instanceId) return []
    return [...bridge.sessions]
      .filter(s => s.instance_id === instanceId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [bridge.sessions, instanceId])
  const navIndex = useMemo(() => {
    const id = bridge.activeSession?.bridge_id
    if (!id) return -1
    return navOrder.findIndex(s => s.bridge_id === id)
  }, [navOrder, bridge.activeSession])

  const handlePrevSession = useCallback(() => {
    if (navIndex <= 0) return
    const target = navOrder[navIndex - 1]
    onUpdate(w => ({ ...w, sessionId: target.bridge_id }))
    if (instanceId) bridgePrefs.setLastSession(instanceId, target.bridge_id)
  }, [navIndex, navOrder, instanceId, onUpdate, bridgePrefs])

  const handleNextSession = useCallback(() => {
    if (navIndex < 0 || navIndex >= navOrder.length - 1) return
    const target = navOrder[navIndex + 1]
    onUpdate(w => ({ ...w, sessionId: target.bridge_id }))
    if (instanceId) bridgePrefs.setLastSession(instanceId, target.bridge_id)
  }, [navIndex, navOrder, instanceId, onUpdate, bridgePrefs])

  const capabilities = useMemo(() => {
    const info = harnesses.find(h => h.name === activeHarness)
    return new Set(info?.capabilities ?? [])
  }, [harnesses, activeHarness])

  const harnessModels = useMemo(() => {
    const harness = harnesses.find(h => h.name === activeHarness)
    const providers = harness?.supported_providers
    const filtered = providers?.length ? storeModels.filter(m => providers.includes(m.provider)) : storeModels
    return filtered.map(m => ({ value: m.id, label: `${m.name || m.id} ($${m.input_cost}/$${m.output_cost})` }))
  }, [storeModels, harnesses, activeHarness])

  const handleCompact = useCallback(() => bridge.compact(), [bridge])
  const handleFork = useCallback(() => bridge.fork(), [bridge])

  const contextInfo = useMemo(() => {
    for (let i = bridge.logRows.length - 1; i >= 0; i--) {
      const r = bridge.logRows[i]
      if (r.actor === 'assistant' && r.done && r.meta?.usage) {
        const tokens = r.meta.usage.context_tokens ?? 0
        const limit = r.meta.usage.context_limit ?? 0
        const pct = tokens && limit ? Math.min(100, Math.round((tokens / limit) * 100)) : 0
        return { tokens, limit, pct }
      }
    }
    return { tokens: 0, limit: 0, pct: 0 }
  }, [bridge.logRows])
  const contextTone = contextInfo.pct >= 90 ? 'crit' : contextInfo.pct >= 70 ? 'warn' : ''

  const handleSend = useCallback(async (text: string) => {
    if (pendingConfigRef.current) {
      bridge.sendConfig(pendingConfigRef.current)
      if (activeHarness) {
        bridgePrefs.setHarnessDefaults(activeHarness, pendingConfigRef.current)
      }
      pendingConfigRef.current = null
    }
    if (bridge.uiState === 'running') await bridge.interrupt()
    bridge.send(text)
  }, [bridge, bridgePrefs, activeHarness])

  const handleRename = useCallback((name: string) => {
    if (activeChat?.sessionId) bridge.renameSession(activeChat.sessionId, name)
  }, [bridge, activeChat])

  const controlsBar = (
    <div className="bc-controls-bar">
      {bridge.activeSession && (
        <>
          <StatusChip uiState={bridge.uiState} activity={bridge.activity} compacting={bridge.compacting} />
          {capabilities.has('model') && harnessModels.length > 0 && (
            <select className="bc-ctrl-select" value={configModel} onChange={e => setConfigModel(e.target.value)} title="Model">
              <option value="">Model</option>
              {harnessModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
          {capabilities.has('effort') && (
            <select className="bc-ctrl-select" value={configEffort} onChange={e => setConfigEffort(e.target.value)} title="Effort">
              <option value="">Effort</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">XHigh</option>
              <option value="max">Max</option>
            </select>
          )}
          {capabilities.has('compact') && (
            <button
              className={`bc-ctrl-btn bc-ctrl-btn-compact${contextTone ? ` bc-ctrl-btn-compact-${contextTone}` : ''}`}
              onClick={handleCompact}
              title={contextInfo.tokens && contextInfo.limit
                ? `Compact context — ${formatTokens(contextInfo.tokens)} / ${formatTokens(contextInfo.limit)} (${contextInfo.pct}%)`
                : 'Compact context'}
              style={{ ['--ctx-pct' as string]: `${contextInfo.pct}%` }}
            >
              <span className="bc-ctrl-btn-bar" aria-hidden />
              <span className="bc-ctrl-btn-text">Compact{contextInfo.pct > 0 ? ` ${contextInfo.pct}%` : ''}</span>
            </button>
          )}
          {capabilities.has('fork') && (
            <button className="bc-ctrl-btn" onClick={handleFork} title="Fork session">Fork</button>
          )}
          {capabilities.has('system_prompt') && (
            <button
              className="bc-ctrl-btn"
              onClick={() => setShowSystemPrompt(true)}
              disabled={!bridge.activeSession.info}
              title={bridge.activeSession.info ? 'View system prompt' : 'System prompt will be available after the session starts'}
            >System Prompt</button>
          )}
          {capabilities.has('tools') && (
            <button
              className={`bc-ctrl-btn ${showTools ? 'bc-ctrl-btn-active' : ''}`}
              onClick={() => setShowTools(s => !s)}
              disabled={!bridge.activeSession.info}
              title={bridge.activeSession.info ? 'Toggle available tools' : 'Tools will be available after the session starts'}
            >Tools{bridge.activeSession.info?.tools?.length ? ` (${bridge.activeSession.info.tools.length})` : ''}</button>
          )}
          <SessionBypassToggle session={bridge.activeSession} />
        </>
      )}
    </div>
  )

  // In minimal mode, the focused workspace's controls go into the bottom
  // sheet via a portal. Non-focused workspaces hide their controls
  // entirely on mobile (only the focused one is reachable). In normal
  // mode every workspace renders its controls inline.
  const renderControls = (() => {
    if (!minimal) return controlsBar
    if (focused && controlsSlot) return createPortal(controlsBar, controlsSlot)
    return null
  })()

  return (
    <div
      className={`bc-workspace${focused ? ' bc-workspace-focused' : ''}${minimal ? ' bc-workspace-minimal' : ''}`}
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
    >
      {!minimal && <SessionHeader
        chat={activeChat}
        session={bridge.activeSession}
        harnessInfo={activeHarnessInfo}
        machine={activeMachine}
        machineReachable={activeReachable}
        basePath={basePath}
        uiState={bridge.uiState}
        rows={bridge.logRows}
        onRename={handleRename}
        onPrev={handlePrevSession}
        onNext={handleNextSession}
        hasPrev={navIndex > 0}
        hasNext={navIndex >= 0 && navIndex < navOrder.length - 1}
        panesHidden={workspace.panesHidden}
        onToggleTurns={() => togglePane('turns')}
        onToggleThread={() => togglePane('thread')}
        onToggleTimeline={() => togglePane('timeline')}
        onToggleGit={() => togglePane('git')}
        onToggleKanban={() => togglePane('kanban')}
        onCloseWorkspace={onClose}
        gitRepos={gitRepos}
        selectedRepo={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />}
      <WorkspaceProvider value={{
        chat: activeChat,
        rows: bridge.logRows,
        loading: bridge.loadingHistory,
        uiState: bridge.uiState,
        activity: bridge.activity,
        error: bridge.error,
        // In minimal (mobile) mode, force the per-workspace pane state to
        // show only the user's currently-selected mobilePane. The
        // workspace's persisted panesHidden/layout are left untouched —
        // the user keeps their split layout when they return to full mode.
        panesHidden: minimal
          ? { turns: mobilePane !== 'turns', thread: mobilePane !== 'thread', timeline: mobilePane !== 'timeline', git: mobilePane !== 'git', kanban: mobilePane !== 'kanban' }
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
      }}>
        <PendingPermissionsBanner />
        <LayoutRenderer tree={minimal ? { kind: 'leaf', viewType: mobilePane } : workspace.layout} />
      </WorkspaceProvider>
      {renderControls}
      {showTools && bridge.activeSession?.info && <ToolsPanel info={bridge.activeSession.info} />}
      <Composer
        sessionId={bridge.activeSession?.bridge_id ?? null}
        connected={bridge.connected && !!bridge.activeSession}
        streaming={bridge.uiState === 'running'}
        paused={bridge.uiState === 'paused'}
        onSend={handleSend}
        onStop={bridge.interrupt}
        onResume={bridge.resume}
      />
      {showSystemPrompt && bridge.activeSession?.info && (
        <SystemPromptModal
          info={bridge.activeSession.info}
          onClose={() => setShowSystemPrompt(false)}
        />
      )}
    </div>
  )
}

function StatusChip({ uiState, activity, compacting }: {
  uiState: string
  activity: { kind: string; name?: string }
  compacting: boolean
}) {
  if (compacting) {
    return (
      <span className="bc-status-chip bc-status-chip-compacting">
        <StatusDot state="compacting" />
        <span className="bc-status-chip-label">Compacting</span>
      </span>
    )
  }
  if (!uiState || uiState === 'empty') return null
  const stateLabel = uiState.charAt(0).toUpperCase() + uiState.slice(1)
  const activityText = activity.kind !== 'idle' && uiState === 'running'
    ? (activity.kind === 'tool' ? activity.name ?? 'tool' : activity.kind === 'thinking' ? 'thinking' : 'streaming')
    : ''
  return (
    <span className={`bc-status-chip bc-status-chip-${uiState}`}>
      <StatusDot state={uiState} />
      <span className="bc-status-chip-label">{stateLabel}</span>
      {activityText && <span className="bc-status-chip-activity">· {activityText}</span>}
    </span>
  )
}
