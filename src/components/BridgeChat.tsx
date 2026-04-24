import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgeSession } from '../useBridgeSession'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeFolders } from '../useBridgeFolders'
import type { HarnessInfo } from '../types'
import { GitPanel } from './GitPanel'
import { Composer } from './chat/Composer'
import { HarnessTabBar } from './chat/HarnessTabBar'
import { NewInstanceForm } from './chat/NewInstanceForm'
import { SessionHeader } from './chat/SessionHeader'
import { SessionList } from './chat/SessionList'
import { SplitResizer } from './chat/SplitResizer'
import { SystemPromptModal } from './chat/SystemPromptModal'
import { Thread } from './chat/Thread'
import { Timeline } from './chat/Timeline'
import { ToolsPanel } from './chat/ToolsPanel'
import { TurnsView } from './chat/TurnsView'
import { loadCollapseState, loadPaneSizes, saveCollapseState, savePaneSizes } from './chat/persistence'
import type { ChatSession, CollapseState, PaneKey, PaneSizes, StoreModel } from './chat/types'
import { generateDefaultAgent, generateFrontendId } from './chat/utils'

export function BridgeChat() {
  const { fetch: apiFetch, basePath, routes } = useBridgeConfig()
  const bridge = useBridgeSession()
  const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` })
  const instances = useBridgeInstances()
  const folders = useBridgeFolders()
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [storeModels, setStoreModels] = useState<StoreModel[]>([])
  const [configModel, setConfigModel] = useState('')
  const [configEffort, setConfigEffort] = useState('')
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null)
  const [collapseState, setCollapseState] = useState<CollapseState>(loadCollapseState)
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(loadPaneSizes)
  const splitRef = useRef<HTMLDivElement>(null)
  useEffect(() => { savePaneSizes(paneSizes) }, [paneSizes])
  const pendingConfigRef = useRef<{ model?: string; effort?: string } | null>(null)

  const toggleHarnessBar = useCallback(() => {
    setCollapseState(s => { const next = { ...s, harnessBar: !s.harnessBar }; saveCollapseState(next); return next })
  }, [])
  const toggleSessionList = useCallback(() => {
    setCollapseState(s => { const next = { ...s, sessionList: !s.sessionList }; saveCollapseState(next); return next })
  }, [])
  const toggleTurns = useCallback(() => {
    setCollapseState(s => { const next = { ...s, turns: !s.turns }; saveCollapseState(next); return next })
  }, [])
  const toggleThread = useCallback(() => {
    setCollapseState(s => { const next = { ...s, thread: !s.thread }; saveCollapseState(next); return next })
  }, [])
  const toggleTimeline = useCallback(() => {
    setCollapseState(s => { const next = { ...s, timeline: !s.timeline }; saveCollapseState(next); return next })
  }, [])
  const toggleGit = useCallback(() => {
    setCollapseState(s => { const next = { ...s, git: !s.git }; saveCollapseState(next); return next })
  }, [])
  const closeAllPanes = useCallback(() => {
    setCollapseState(s => {
      const next = { ...s, turns: true, thread: true, timeline: true, git: true }
      saveCollapseState(next)
      return next
    })
  }, [])

  useEffect(() => {
    apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data: StoreModel[]) => {
      setStoreModels(data.filter(m => m.enabled))
    }).catch(() => {})
  }, [apiFetch, basePath])

  const selectedHarness = useMemo(() => {
    if (!selectedInstance) return ''
    return instances.instanceMap.get(selectedInstance)?.harness_type ?? ''
  }, [selectedInstance, instances.instanceMap])

  useEffect(() => {
    const config: { model?: string; effort?: string } = {}
    if (configModel) config.model = configModel
    if (configEffort) config.effort = configEffort
    pendingConfigRef.current = (configModel || configEffort) ? config : null
  }, [configModel, configEffort])

  useEffect(() => {
    if (selectedInstance || instances.loading) return
    const lastInstanceId = bridgePrefs.prefs.last_instance_id
    if (lastInstanceId && instances.instanceMap.has(lastInstanceId)) {
      setSelectedInstance(lastInstanceId)
    } else {
      const first = instances.instances.find(i => i.enabled)
      if (first) setSelectedInstance(first.id)
    }
  }, [bridgePrefs.prefs.last_instance_id, selectedInstance, instances.instances, instances.instanceMap, instances.loading])

  useEffect(() => {
    if (!selectedInstance || bridge.activeSession) return
    const lastId = bridgePrefs.getLastSession(selectedInstance)
    if (lastId) bridge.selectSession(lastId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstance, bridge.activeSession?.bridge_id])

  useEffect(() => {
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
  }, [apiFetch, basePath])

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

  const getDisplayName = useCallback((session: { agent_id?: string; display_name: string; harness: string }): string => {
    if (session.display_name) return session.display_name
    if (session.agent_id) return session.agent_id
    return generateDefaultAgent(session.harness)
  }, [])

  const selectInstance = useCallback((instanceId: string) => {
    setSelectedInstance(instanceId)
    bridgePrefs.setLastInstanceId(instanceId)
    bridge.selectSession('')
    const lastId = bridgePrefs.getLastSession(instanceId)
    if (lastId) setTimeout(() => bridge.selectSession(lastId), 0)
  }, [bridge, bridgePrefs])

  const handleSelectSession = useCallback((id: string) => {
    bridge.selectSession(id)
    if (id && selectedInstance) bridgePrefs.setLastSession(selectedInstance, id)
  }, [bridge, bridgePrefs, selectedInstance])

  const handleCreate = useCallback(async () => {
    if (!selectedInstance || !selectedHarness) return
    const frontendId = generateFrontendId()
    const agentId = generateDefaultAgent(selectedHarness)

    setActiveChat({
      frontendId,
      sessionId: null,
      harness: selectedHarness,
      agent: agentId,
      displayName: agentId,
    })

    const sess = await bridge.createSession({
      harness: selectedHarness,
      instanceId: selectedInstance,
      agentId,
      displayName: '',
      clientId: frontendId,
    })
    if (sess) {
      bridgePrefs.setLastSession(selectedInstance, sess.bridge_id)
      const defaults = bridgePrefs.getDefaults(selectedHarness)
      if (defaults.model || defaults.effort || defaults.max_budget || defaults.disabled_tools?.length) {
        bridge.sendConfig({
          model: defaults.model,
          effort: defaults.effort,
          max_budget: defaults.max_budget,
          disabled_tools: defaults.disabled_tools,
        })
      }
    } else {
      setActiveChat(null)
    }
  }, [bridge, bridgePrefs, selectedInstance, selectedHarness])

  const harnessAvailable = useMemo(() => {
    if (!selectedHarness) return false
    return harnesses.find(h => h.name === selectedHarness)?.available ?? false
  }, [harnesses, selectedHarness])

  const filteredSessions = useMemo(() =>
    bridge.sessions.filter(s => s.instance_id === selectedInstance),
    [bridge.sessions, selectedInstance]
  )

  const navOrder = useMemo(() =>
    [...filteredSessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [filteredSessions]
  )
  const navIndex = useMemo(() => {
    const id = bridge.activeSession?.bridge_id
    if (!id) return -1
    return navOrder.findIndex(s => s.bridge_id === id)
  }, [navOrder, bridge.activeSession])
  const handlePrevSession = useCallback(() => {
    if (navIndex <= 0) return
    const target = navOrder[navIndex - 1]
    bridge.selectSession(target.bridge_id)
    if (selectedInstance) bridgePrefs.setLastSession(selectedInstance, target.bridge_id)
  }, [navIndex, navOrder, bridge, bridgePrefs, selectedInstance])
  const handleNextSession = useCallback(() => {
    if (navIndex < 0 || navIndex >= navOrder.length - 1) return
    const target = navOrder[navIndex + 1]
    bridge.selectSession(target.bridge_id)
    if (selectedInstance) bridgePrefs.setLastSession(selectedInstance, target.bridge_id)
  }, [navIndex, navOrder, bridge, bridgePrefs, selectedInstance])

  const activeInstance = useMemo(() => {
    if (!bridge.activeSession?.instance_id) return null
    return instances.instanceMap.get(bridge.activeSession.instance_id) ?? null
  }, [bridge.activeSession, instances.instanceMap])

  const capabilities = useMemo(() => {
    const harness = activeChat?.harness ?? selectedHarness
    const info = harnesses.find(h => h.name === harness)
    return new Set(info?.capabilities ?? [])
  }, [harnesses, activeChat, selectedHarness])

  const harnessModels = useMemo(() => {
    const harness = harnesses.find(h => h.name === (activeChat?.harness ?? selectedHarness))
    const providers = harness?.supported_providers
    const filtered = providers?.length ? storeModels.filter(m => providers.includes(m.provider)) : storeModels
    return filtered.map(m => ({ value: m.id, label: `${m.name || m.id} ($${m.input_cost}/$${m.output_cost})` }))
  }, [storeModels, harnesses, activeChat, selectedHarness])

  const handleCompact = useCallback(() => bridge.compact(), [bridge])
  const handleFork = useCallback(() => bridge.fork(), [bridge])

  const handleSend = useCallback((text: string) => {
    if (pendingConfigRef.current) {
      bridge.sendConfig(pendingConfigRef.current)
      if (selectedHarness) {
        bridgePrefs.setHarnessDefaults(selectedHarness, pendingConfigRef.current)
      }
      pendingConfigRef.current = null
    }
    bridge.send(text)
  }, [bridge, bridgePrefs, selectedHarness])

  const handleRenameSession = useCallback((id: string, name: string) => {
    bridge.renameSession(id, name)
  }, [bridge])

  const handleCreateInstance = useCallback(async (data: { name: string; harness_type: string; host: string; transport: 'local' | 'ssh'; working_dir: string; max_concurrent_sessions: number }) => {
    const inst = await instances.createInstance(data)
    if (inst) {
      setSelectedInstance(inst.id)
      bridgePrefs.setLastInstanceId(inst.id)
    }
    setShowNewInstance(false)
  }, [instances, bridgePrefs])

  const currentInstanceName = useMemo(() => {
    if (!selectedInstance) return ''
    return instances.instanceMap.get(selectedInstance)?.name ?? ''
  }, [selectedInstance, instances.instanceMap])

  return (
    <div className={`bc-container ${collapseState.harnessBar ? 'bc-harness-collapsed' : ''} ${collapseState.sessionList ? 'bc-sidebar-collapsed' : ''}`}>
      {collapseState.harnessBar ? (
        <div className="htb-wrapper htb-wrapper-collapsed">
          <button className="htb-expand-btn" onClick={toggleHarnessBar} title="Expand harness bar" aria-label="Expand harness bar">
            <span className="htb-expand-chevron">▾</span>
            <span className="htb-expand-label">Harness: {currentInstanceName || 'none selected'}</span>
          </button>
        </div>
      ) : (
        <HarnessTabBar
          instances={instances.instances}
          harnesses={harnesses}
          sessions={bridge.sessions}
          selectedInstance={selectedInstance}
          onSelect={selectInstance}
          onNewInstance={() => setShowNewInstance(true)}
          basePath={basePath}
          instancesPath={routes.instances}
          onToggleCollapse={toggleHarnessBar}
        />
      )}
      <div className="bc-main">
        {collapseState.sessionList ? (
          <button className="bc-sidebar-strip" onClick={toggleSessionList} title="Show sessions" aria-label="Show sessions">
            <span className="bc-sidebar-strip-chevron">▸</span>
            <span className="bc-sidebar-strip-label">Sessions</span>
          </button>
        ) : (
          <SessionList
            sessions={filteredSessions}
            activeSession={bridge.activeSession?.bridge_id ?? ''}
            onSelect={handleSelectSession}
            onNewSession={handleCreate}
            connected={bridge.connected && harnessAvailable}
            getDisplayName={getDisplayName}
            onRename={handleRenameSession}
            folders={folders}
            onAfterFolderChange={bridge.refreshSessions}
            onToggleCollapse={toggleSessionList}
          />
        )}
        <div className="bc-chat-area">
          <SessionHeader
            chat={activeChat}
            uiState={bridge.uiState}
            activity={bridge.activity}
            rows={bridge.logRows}
            instance={activeInstance}
            onRename={name => activeChat?.sessionId && handleRenameSession(activeChat.sessionId, name)}
            onPrev={handlePrevSession}
            onNext={handleNextSession}
            hasPrev={navIndex > 0}
            hasNext={navIndex >= 0 && navIndex < navOrder.length - 1}
            collapseState={collapseState}
            onToggleTurns={toggleTurns}
            onToggleThread={toggleThread}
            onToggleTimeline={toggleTimeline}
            onToggleGit={toggleGit}
            onCloseAllPanes={closeAllPanes}
          />
          <div ref={splitRef} className="bc-chat-split">
            {(() => {
              const paneOrder: PaneKey[] = ['turns', 'thread', 'timeline', 'git']
              const visible = paneOrder.filter(k => !collapseState[k])
              if (visible.length === 0) {
                return (
                  <div className="bc-split-empty">
                    <div className="bc-split-empty-hint">
                      All panes hidden. Use the toggles above to show Turns, Thread, Timeline, or Git.
                    </div>
                  </div>
                )
              }
              const renderPane = (key: PaneKey) => {
                const style = { flex: `${paneSizes[key]} 1 0` }
                switch (key) {
                  case 'turns':
                    return (
                      <TurnsView
                        key="turns"
                        rows={bridge.logRows}
                        agent={activeChat?.agent ?? ''}
                        onToggleCollapse={toggleTurns}
                        style={style}
                        paneKey="turns"
                      />
                    )
                  case 'thread':
                    return (
                      <div key="thread" className="bc-split-pane bc-split-pane-thread" style={style} data-pane="thread">
                        <div
                          className="bc-split-pane-header bc-header-clickable"
                          onClick={toggleThread}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleThread() } }}
                          role="button"
                          tabIndex={0}
                          title="Hide thread"
                          aria-label="Hide thread"
                        >
                          <span className="bc-split-pane-title">Thread</span>
                          <span className="bc-spacer" />
                          <span className="bc-split-collapse-btn" aria-hidden="true">×</span>
                        </div>
                        <Thread
                          rows={bridge.logRows}
                          loading={bridge.loadingHistory}
                          uiState={bridge.uiState}
                          activity={bridge.activity}
                          error={bridge.error}
                          agent={activeChat?.agent ?? ''}
                          sessionId={activeChat?.sessionId ?? ''}
                        />
                      </div>
                    )
                  case 'timeline':
                    return (
                      <Timeline
                        key="timeline"
                        rows={bridge.logRows}
                        onToggleCollapse={toggleTimeline}
                        style={style}
                        paneKey="timeline"
                      />
                    )
                  case 'git':
                    return (
                      <GitPanel
                        key="git"
                        sessionId={activeChat?.sessionId ?? ''}
                        uiState={bridge.uiState}
                        onToggleCollapse={toggleGit}
                        style={style}
                        paneKey="git"
                      />
                    )
                }
              }
              const nodes: React.ReactNode[] = []
              visible.forEach((key, i) => {
                if (i > 0) {
                  const leftKey = visible[i - 1]
                  nodes.push(
                    <SplitResizer
                      key={`resizer-${leftKey}-${key}`}
                      leftKey={leftKey}
                      rightKey={key}
                      containerRef={splitRef}
                      setSizes={setPaneSizes}
                    />
                  )
                }
                nodes.push(renderPane(key))
              })
              return nodes
            })()}
          </div>
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
        </div>
      </div>
      {showNewInstance && (
        <NewInstanceForm
          harnesses={harnesses}
          onCreate={handleCreateInstance}
          onCancel={() => setShowNewInstance(false)}
        />
      )}
      {showSystemPrompt && bridge.activeSession?.info && (
        <SystemPromptModal
          info={bridge.activeSession.info}
          onClose={() => setShowSystemPrompt(false)}
        />
      )}
    </div>
  )
}
