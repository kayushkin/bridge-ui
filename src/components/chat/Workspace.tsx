import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HarnessInfo, ManagedSession } from '../../types'
import { useBridgeSession } from '../../useBridgeSession'
import { Composer } from './Composer'
import { LayoutRenderer } from './LayoutRenderer'
import { SessionHeader } from './SessionHeader'
import { SystemPromptModal } from './SystemPromptModal'
import { ToolsPanel } from './ToolsPanel'
import { WorkspaceProvider } from './WorkspaceContext'
import type { ChatSession, PaneKey, PaneSizes, StoreModel, WorkspaceState } from './types'
import { generateDefaultAgent } from './utils'

interface WorkspaceProps {
  workspace: WorkspaceState
  focused: boolean
  onFocus: () => void
  onUpdate: (fn: (w: WorkspaceState) => WorkspaceState) => void
  onClose?: () => void
  harnesses: HarnessInfo[]
  storeModels: StoreModel[]
  bridgePrefs: {
    getDefaults: (harness: string) => { model?: string; effort?: string; max_budget?: number; disabled_tools?: string[] }
    setHarnessDefaults: (harness: string, config: { model?: string; effort?: string; max_budget?: number; disabled_tools?: string[] }) => void
    setLastSession: (instanceId: string, sessionId: string) => void
  }
}

export function Workspace({ workspace, focused, onFocus, onUpdate, onClose, harnesses, storeModels, bridgePrefs }: WorkspaceProps) {
  const bridge = useBridgeSession()
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null)
  const [configModel, setConfigModel] = useState('')
  const [configEffort, setConfigEffort] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const pendingConfigRef = useRef<{ model?: string; effort?: string } | null>(null)

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
    const agent = sess.agent_id ? sess.agent_id : generateDefaultAgent(sess.harness)
    setActiveChat({
      frontendId: sess.client_id || `fe_${sess.bridge_id}`,
      sessionId: sess.bridge_id,
      harness: sess.harness,
      agent,
      displayName: sess.display_name || agent,
    })
  }, [bridge.activeSession])

  useEffect(() => {
    const config: { model?: string; effort?: string } = {}
    if (configModel) config.model = configModel
    if (configEffort) config.effort = configEffort
    pendingConfigRef.current = (configModel || configEffort) ? config : null
  }, [configModel, configEffort])

  const togglePane = useCallback((key: PaneKey) => {
    onUpdate(w => ({ ...w, panesHidden: { ...w.panesHidden, [key]: !w.panesHidden[key] } }))
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

  const activeHarness = activeChat?.harness ?? ''
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

  const handleSend = useCallback((text: string) => {
    if (pendingConfigRef.current) {
      bridge.sendConfig(pendingConfigRef.current)
      if (activeHarness) {
        bridgePrefs.setHarnessDefaults(activeHarness, pendingConfigRef.current)
      }
      pendingConfigRef.current = null
    }
    bridge.send(text)
  }, [bridge, bridgePrefs, activeHarness])

  const handleRename = useCallback((name: string) => {
    if (activeChat?.sessionId) bridge.renameSession(activeChat.sessionId, name)
  }, [bridge, activeChat])

  return (
    <div
      className={`bc-workspace${focused ? ' bc-workspace-focused' : ''}`}
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
    >
      <SessionHeader
        chat={activeChat}
        uiState={bridge.uiState}
        activity={bridge.activity}
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
        onCloseWorkspace={onClose}
      />
      <WorkspaceProvider value={{
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
      }}>
        <LayoutRenderer tree={workspace.layout} />
      </WorkspaceProvider>
      <div className="bc-controls-bar">
        {bridge.activeSession && (
          <>
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
              <button className="bc-ctrl-btn" onClick={handleCompact} title="Compact context">Compact</button>
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
          </>
        )}
      </div>
      {showTools && bridge.activeSession?.info && <ToolsPanel info={bridge.activeSession.info} />}
      <Composer
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
