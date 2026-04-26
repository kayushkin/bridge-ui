import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgeSession } from '../useBridgeSession'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeFolders } from '../useBridgeFolders'
import type { HarnessInfo } from '../types'
import { SessionList } from './chat/SessionList'
import { Workspace } from './chat/Workspace'
import { loadCollapseState, loadWorkspacesState, saveCollapseState, saveWorkspacesState } from './chat/persistence'
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

const DEFAULT_PANES_HIDDEN: PanesHidden = { turns: false, thread: true, timeline: true, git: true }
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
  const [storeModels, setStoreModels] = useState<StoreModel[]>([])
  const [collapseState, setCollapseState] = useState<CollapseState>(loadCollapseState)
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>(() => loadWorkspacesState().workspaces)
  const [focusedWorkspaceId, setFocusedWorkspaceId] = useState<string | null>(() => loadWorkspacesState().focusedWorkspaceId)
  const bootstrappedRef = useRef(false)

  useEffect(() => {
    saveWorkspacesState({ workspaces, focusedWorkspaceId })
  }, [workspaces, focusedWorkspaceId])

  const toggleSessionList = useCallback(() => {
    setCollapseState(s => { const next = { ...s, sessionList: !s.sessionList }; saveCollapseState(next); return next })
  }, [])

  const updateWorkspace = useCallback((id: string, fn: (w: WorkspaceState) => WorkspaceState) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? fn(w) : w))
  }, [])

  const closeWorkspace = useCallback((id: string) => {
    setWorkspaces(prev => {
      const next = prev.filter(w => w.id !== id)
      setFocusedWorkspaceId(curFocus => {
        if (curFocus !== id) return curFocus
        return next[0]?.id ?? null
      })
      return next
    })
  }, [])

  const spawnWorkspace = useCallback((sessionId: string | null) => {
    const ws = makeWorkspace(sessionId)
    setWorkspaces(prev => [...prev, ws])
    setFocusedWorkspaceId(ws.id)
  }, [])

  // Plain click on a session row: focus existing workspace if one exists for
  // that session, else retarget the focused workspace, else spawn one. Use
  // the + button to explicitly open in a new split.
  const handleSelectSession = useCallback((id: string) => {
    if (!id) return
    const existing = workspaces.find(w => w.sessionId === id)
    if (existing) {
      setFocusedWorkspaceId(existing.id)
    } else if (focusedWorkspaceId && workspaces.some(w => w.id === focusedWorkspaceId)) {
      setWorkspaces(prev => prev.map(w => w.id === focusedWorkspaceId ? { ...w, sessionId: id } : w))
    } else {
      const ws = makeWorkspace(id)
      setWorkspaces(prev => [...prev, ws])
      setFocusedWorkspaceId(ws.id)
    }
    const session = bridge.sessions.find(s => s.bridge_id === id)
    if (session?.instance_id) {
      bridgePrefs.setLastSession(session.instance_id, id)
      bridgePrefs.setLastInstanceId(session.instance_id)
    }
  }, [workspaces, focusedWorkspaceId, bridge.sessions, bridgePrefs])

  useEffect(() => {
    apiFetch(`${basePath}/models`).then(r => r.ok ? r.json() : []).then((data: StoreModel[]) => {
      setStoreModels(data.filter(m => m.enabled))
    }).catch(() => {})
  }, [apiFetch, basePath])

  // Bootstrap one workspace from the last-used instance's last session on
  // first ready render — but only if nothing was restored from localStorage.
  useEffect(() => {
    if (bootstrappedRef.current) return
    if (instances.loading) return
    bootstrappedRef.current = true
    if (workspaces.length > 0) return
    const lastInstanceId = bridgePrefs.prefs.last_instance_id
    if (!lastInstanceId || !instances.instanceMap.has(lastInstanceId)) return
    const lastId = bridgePrefs.getLastSession(lastInstanceId)
    if (lastId) {
      const ws = makeWorkspace(lastId)
      setWorkspaces([ws])
      setFocusedWorkspaceId(ws.id)
    }
  }, [bridgePrefs, instances.loading, instances.instanceMap, workspaces.length])

  useEffect(() => {
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
  }, [apiFetch, basePath])

  const getDisplayName = useCallback((session: { agent_id?: string; display_name: string; harness: string }): string => {
    if (session.display_name) return session.display_name
    if (session.agent_id) return session.agent_id
    return generateDefaultAgent(session.harness)
  }, [])

  const handleCreateForInstance = useCallback(async (instanceId: string) => {
    const inst = instances.instanceMap.get(instanceId)
    if (!inst) return
    const harness = inst.harness_type
    const harnessInfo = harnesses.find(h => h.name === harness)
    if (!harnessInfo?.available) return
    const frontendId = generateFrontendId()
    const agentId = generateDefaultAgent(harness)
    const sess = await bridge.createSession({
      harness,
      instanceId,
      agentId,
      displayName: '',
      clientId: frontendId,
    })
    if (sess) {
      bridgePrefs.setLastInstanceId(instanceId)
      bridgePrefs.setLastSession(instanceId, sess.bridge_id)
      const defaults = bridgePrefs.getDefaults(harness)
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
  }, [bridge, bridgePrefs, instances.instanceMap, harnesses, spawnWorkspace])

  const handleRenameSession = useCallback((id: string, name: string) => {
    bridge.renameSession(id, name)
  }, [bridge])

  const openSessionIds = useMemo(
    () => new Set(workspaces.map(w => w.sessionId).filter((id): id is string => !!id)),
    [workspaces]
  )
  const focusedSessionId = useMemo(() => {
    const ws = workspaces.find(w => w.id === focusedWorkspaceId)
    return ws?.sessionId ?? null
  }, [workspaces, focusedWorkspaceId])

  const defaultInstanceId = bridgePrefs.prefs.last_instance_id

  return (
    <div className={`bc-container ${collapseState.sessionList ? 'bc-sidebar-collapsed' : ''}`}>
      <div className="bc-main">
        {collapseState.sessionList ? (
          <button className="bc-sidebar-strip" onClick={toggleSessionList} title="Show sessions" aria-label="Show sessions">
            <span className="bc-sidebar-strip-chevron">▸</span>
            <span className="bc-sidebar-strip-label">Sessions</span>
          </button>
        ) : (
          <SessionList
            sessions={bridge.sessions}
            instances={instances.instances}
            harnesses={harnesses}
            basePath={basePath}
            instancesPath={routes.instances}
            defaultInstanceId={defaultInstanceId}
            openSessionIds={openSessionIds}
            focusedSessionId={focusedSessionId}
            onSelect={handleSelectSession}
            onSpawnWorkspace={spawnWorkspace}
            onNewSession={handleCreateForInstance}
            connected={bridge.connected}
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
                focused={w.id === focusedWorkspaceId}
                onFocus={() => setFocusedWorkspaceId(w.id)}
                onUpdate={fn => updateWorkspace(w.id, fn)}
                onClose={() => closeWorkspace(w.id)}
                harnesses={harnesses}
                storeModels={storeModels}
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
    </div>
  )
}
