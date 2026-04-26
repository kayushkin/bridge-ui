import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgeSession } from '../useBridgeSession'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeFolders } from '../useBridgeFolders'
import type { HarnessInfo } from '../types'
import { HarnessTabBar } from './chat/HarnessTabBar'
import { NewInstanceForm } from './chat/NewInstanceForm'
import { SessionList } from './chat/SessionList'
import { Workspace } from './chat/Workspace'
import { loadCollapseState, saveCollapseState } from './chat/persistence'
import type { CollapseState, InnerNode, PaneSizes, PanesHidden, StoreModel, WorkspaceState } from './chat/types'
import { generateDefaultAgent, generateFrontendId } from './chat/utils'

const DEFAULT_INNER_TREE: InnerNode = {
  kind: 'split',
  direction: 'h',
  children: [
    { kind: 'leaf', viewType: 'turns' },
    { kind: 'leaf', viewType: 'thread' },
    { kind: 'leaf', viewType: 'timeline' },
    { kind: 'leaf', viewType: 'git' },
  ],
}

const DEFAULT_PANES_HIDDEN: PanesHidden = { turns: false, thread: false, timeline: true, git: true }
const DEFAULT_PANE_SIZES: PaneSizes = { turns: 1, thread: 1, timeline: 1, git: 1 }

function makeWorkspace(sessionId: string | null, seed?: Partial<WorkspaceState>): WorkspaceState {
  return {
    id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    panesHidden: { ...DEFAULT_PANES_HIDDEN },
    paneSizes: { ...DEFAULT_PANE_SIZES },
    layout: DEFAULT_INNER_TREE,
    ...seed,
  }
}

export function BridgeChat() {
  const { fetch: apiFetch, basePath, routes } = useBridgeConfig()
  const bridge = useBridgeSession()
  const bridgePrefs = useBridgePrefs({ fetch: apiFetch, endpoint: `${basePath}/bridge-prefs` })
  const instances = useBridgeInstances()
  const folders = useBridgeFolders()
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [storeModels, setStoreModels] = useState<StoreModel[]>([])
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [collapseState, setCollapseState] = useState<CollapseState>(loadCollapseState)
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
  const bootstrappedRef = useRef(false)

  const toggleHarnessBar = useCallback(() => {
    setCollapseState(s => { const next = { ...s, harnessBar: !s.harnessBar }; saveCollapseState(next); return next })
  }, [])
  const toggleSessionList = useCallback(() => {
    setCollapseState(s => { const next = { ...s, sessionList: !s.sessionList }; saveCollapseState(next); return next })
  }, [])

  const updateWorkspace = useCallback((id: string, fn: (w: WorkspaceState) => WorkspaceState) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? fn(w) : w))
  }, [])

  const closeWorkspace = useCallback((id: string) => {
    setWorkspaces(prev => prev.filter(w => w.id !== id))
  }, [])

  const spawnWorkspace = useCallback((sessionId: string | null) => {
    setWorkspaces(prev => [...prev, makeWorkspace(sessionId)])
  }, [])

  // Click session in sidebar: focus existing workspace if any, else spawn.
  const handleSelectSession = useCallback((id: string) => {
    setWorkspaces(prev => {
      if (prev.some(w => w.sessionId === id)) return prev
      return [...prev, makeWorkspace(id)]
    })
    if (id && selectedInstance) bridgePrefs.setLastSession(selectedInstance, id)
  }, [bridgePrefs, selectedInstance])

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
    if (selectedInstance || instances.loading) return
    const lastInstanceId = bridgePrefs.prefs.last_instance_id
    if (lastInstanceId && instances.instanceMap.has(lastInstanceId)) {
      setSelectedInstance(lastInstanceId)
    } else {
      const first = instances.instances.find(i => i.enabled)
      if (first) setSelectedInstance(first.id)
    }
  }, [bridgePrefs.prefs.last_instance_id, selectedInstance, instances.instances, instances.instanceMap, instances.loading])

  // Bootstrap one workspace from the last-selected session on first ready render.
  useEffect(() => {
    if (bootstrappedRef.current) return
    if (!selectedInstance) return
    const lastId = bridgePrefs.getLastSession(selectedInstance)
    if (lastId) {
      bootstrappedRef.current = true
      setWorkspaces([makeWorkspace(lastId)])
    } else {
      // Mark bootstrapped so we don't keep retrying on every render once an
      // instance is selected without a saved last session.
      bootstrappedRef.current = true
    }
  }, [selectedInstance, bridgePrefs])

  useEffect(() => {
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
  }, [apiFetch, basePath])

  const getDisplayName = useCallback((session: { agent_id?: string; display_name: string; harness: string }): string => {
    if (session.display_name) return session.display_name
    if (session.agent_id) return session.agent_id
    return generateDefaultAgent(session.harness)
  }, [])

  const selectInstance = useCallback((instanceId: string) => {
    setSelectedInstance(instanceId)
    bridgePrefs.setLastInstanceId(instanceId)
  }, [bridgePrefs])

  const handleCreate = useCallback(async () => {
    if (!selectedInstance || !selectedHarness) return
    const frontendId = generateFrontendId()
    const agentId = generateDefaultAgent(selectedHarness)
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
      spawnWorkspace(sess.bridge_id)
    }
  }, [bridge, bridgePrefs, selectedInstance, selectedHarness, spawnWorkspace])

  const harnessAvailable = useMemo(() => {
    if (!selectedHarness) return false
    return harnesses.find(h => h.name === selectedHarness)?.available ?? false
  }, [harnesses, selectedHarness])

  const filteredSessions = useMemo(() =>
    bridge.sessions.filter(s => s.instance_id === selectedInstance),
    [bridge.sessions, selectedInstance]
  )

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

  const openSessionIds = useMemo(
    () => new Set(workspaces.map(w => w.sessionId).filter((id): id is string => !!id)),
    [workspaces]
  )

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
            openSessionIds={openSessionIds}
            onSelect={handleSelectSession}
            onSpawnWorkspace={spawnWorkspace}
            onNewSession={handleCreate}
            connected={bridge.connected && harnessAvailable}
            getDisplayName={getDisplayName}
            onRename={handleRenameSession}
            folders={folders}
            onAfterFolderChange={bridge.refreshSessions}
            onToggleCollapse={toggleSessionList}
          />
        )}
        <div className="bc-workspaces">
          {workspaces.length === 0 ? (
            <div className="bc-workspaces-empty">
              <div className="bc-workspaces-empty-hint">
                No workspaces open. Pick a session from the sidebar (or use the + button next to one) to open one.
              </div>
            </div>
          ) : (
            workspaces.map(w => (
              <Workspace
                key={w.id}
                workspace={w}
                onUpdate={fn => updateWorkspace(w.id, fn)}
                onClose={() => closeWorkspace(w.id)}
                harnesses={harnesses}
                storeModels={storeModels}
                instanceMap={instances.instanceMap}
                bridgePrefs={{
                  getDefaults: bridgePrefs.getDefaults,
                  setHarnessDefaults: bridgePrefs.setHarnessDefaults,
                  setLastSession: bridgePrefs.setLastSession,
                }}
              />
            ))
          )}
        </div>
      </div>
      {showNewInstance && (
        <NewInstanceForm
          harnesses={harnesses}
          onCreate={handleCreateInstance}
          onCancel={() => setShowNewInstance(false)}
        />
      )}
    </div>
  )
}
