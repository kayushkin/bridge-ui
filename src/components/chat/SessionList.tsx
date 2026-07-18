import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BridgeInstance, FetchFn, HarnessInfo, Machine, ManagedSession, SessionUIState } from '../../types'
import { ARCHIVE_FOLDER, type UseBridgeFoldersReturn } from '../../useBridgeFolders'
import { EditableName } from './EditableName'
import { HarnessFilterBar, sessionMode, sessionStatusGroup } from './HarnessFilterBar'
import { NewSessionMenu } from './NewSessionMenu'
import { SplitButtons } from './SplitButtons'
import { StatusDot } from './StatusDot'
import {
  loadExcludedHarnesses, loadExcludedMachines, loadFolderCollapsed,
  loadExcludedTypes, loadExcludedPurposes, loadExcludedModes, loadExcludedStatuses,
  loadFilterCollapsed,
  saveExcludedHarnesses, saveExcludedMachines, saveFolderCollapsed,
  saveExcludedTypes, saveExcludedPurposes, saveExcludedModes, saveExcludedStatuses,
  saveFilterCollapsed,
} from './persistence'
import type { CtxMenuState, SplitMode } from './types'

// Max session rows rendered per list before a "Show N more" button. Keeps the
// sidebar DOM small so a large Archive folder can't balloon it to 10k+ nodes.
const SESSION_LIST_CAP = 50

export function SessionList({ sessions, instances, machines, harnesses, basePath, apiFetch, instancesPath, defaultInstanceId, openSessionIds, focusedSessionId, onSelect, onOpenInSplit, onNewChat, connected, getDisplayName, getSessionUIState, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
  sessions: ManagedSession[]
  instances: BridgeInstance[]
  machines: Machine[]
  harnesses: HarnessInfo[]
  basePath: string
  apiFetch: FetchFn
  instancesPath: string
  defaultInstanceId?: string
  openSessionIds: Set<string>
  focusedSessionId: string | null
  onSelect: (id: string) => void
  onOpenInSplit: (id: string, mode: SplitMode) => void
  // Opens a new chat (a pending composer) in the given instance. No server
  // session is created until the first message is sent.
  onNewChat: (instanceId: string, mode: SplitMode) => void
  connected: boolean
  getDisplayName: (session: ManagedSession) => string
  getSessionUIState: (session: ManagedSession) => SessionUIState
  onRename: (id: string, name: string) => void
  folders: UseBridgeFoldersReturn
  onAfterFolderChange: () => void
  onToggleCollapse: () => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadFolderCollapsed)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderRef = useRef<HTMLInputElement>(null)
  const [excludedHarnesses, setExcludedHarnesses] = useState<Set<string>>(loadExcludedHarnesses)
  const [excludedMachines, setExcludedMachines] = useState<Set<string>>(loadExcludedMachines)
  const [excludedTypes, setExcludedTypes] = useState<Set<string>>(loadExcludedTypes)
  const [excludedPurposes, setExcludedPurposes] = useState<Set<string>>(loadExcludedPurposes)
  const [excludedModes, setExcludedModes] = useState<Set<string>>(loadExcludedModes)
  const [excludedStatuses, setExcludedStatuses] = useState<Set<string>>(loadExcludedStatuses)
  const [filterCollapsed, setFilterCollapsed] = useState<boolean>(loadFilterCollapsed)
  const [showNewMenu, setShowNewMenu] = useState(false)
  // Per-list render cap. Each session row is ~30-40 DOM nodes, so an expanded
  // folder of a few hundred (typically the Archive of done sessions) mounts
  // 10k+ nodes at once — enough to bloat React reconciliation and, for Vimium
  // users, to push `f`/link-hint latency past 200ms because Vimium walks the
  // whole document per activation. We render at most SESSION_LIST_CAP rows per
  // list and offer an explicit reveal for the rest; search below covers the
  // find-a-specific-session case without expanding.
  const [listCaps, setListCaps] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => { setCtxMenu(null); setShowNewFolder(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  useEffect(() => {
    if (showNewFolder) newFolderRef.current?.focus()
  }, [showNewFolder])

  const harnessMap = useMemo(() => {
    const m = new Map<string, HarnessInfo>()
    for (const h of harnesses) m.set(h.name, h)
    return m
  }, [harnesses])

  const instanceMap = useMemo(() => {
    const m = new Map<string, BridgeInstance>()
    for (const i of instances) m.set(i.id, i)
    return m
  }, [instances])

  const instanceMachineByID = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of instances) m.set(i.id, i.machine_id)
    return m
  }, [instances])

  // Status is a derived dimension: bucket each session's canonical UI state
  // (the same getSessionUIState that drives the status dot) into a coarse group.
  const statusOf = useCallback(
    (s: ManagedSession) => sessionStatusGroup(getSessionUIState(s)),
    [getSessionUIState]
  )

  const filtered = useMemo(() =>
    sessions.filter(s => {
      if (excludedHarnesses.has(s.harness)) return false
      const machineID = s.instance_id ? instanceMachineByID.get(s.instance_id) : undefined
      if (machineID && excludedMachines.has(machineID)) return false
      if (s.type && excludedTypes.has(s.type)) return false
      if (s.purpose && excludedPurposes.has(s.purpose)) return false
      if (excludedModes.has(sessionMode(s))) return false
      const status = statusOf(s)
      if (status && excludedStatuses.has(status)) return false
      return true
    }),
    [sessions, excludedHarnesses, excludedMachines, excludedTypes, excludedPurposes, excludedModes, excludedStatuses, statusOf, instanceMachineByID]
  )

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [filtered]
  )

  // Free-text search over the sidebar. Matches instantly on display name or
  // session id (client-side); a debounced call to the same message-content
  // search the Sessions page uses (/sessions/search) unions in sessions whose
  // transcript text matches. When a query is active we search ALL sessions —
  // ignoring the exclude-chips and folder grouping — so a hit can never hide
  // inside a collapsed or archived folder.
  const [searchText, setSearchText] = useState('')
  const [contentHits, setContentHits] = useState<Set<string> | null>(null)
  const [searching, setSearching] = useState(false)
  const query = searchText.trim()
  const searchActive = query.length > 0

  useEffect(() => {
    if (!query) { setContentHits(null); setSearching(false); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(() => {
      apiFetch(`${basePath}/sessions/search?q=${encodeURIComponent(query)}`)
        .then(async r => {
          if (!r.ok) throw new Error(`search failed: ${r.status}`)
          const hits: { session_id: string }[] = (await r.json()) ?? []
          if (!cancelled) setContentHits(new Set(hits.map(h => h.session_id)))
        })
        .catch(() => { if (!cancelled) setContentHits(new Set()) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, apiFetch, basePath])

  const searchResults = useMemo(() => {
    if (!searchActive) return []
    const q = query.toLowerCase()
    // Rank so a name/id match always outranks a content-only match, and an
    // exact session-id lands at the very top — otherwise pasting a br_… id
    // buries the intended session under transcripts that merely mention it.
    const rankOf = (s: ManagedSession): number => {
      const id = s.session_id.toLowerCase()
      if (id === q) return 0
      if (getDisplayName(s).toLowerCase().includes(q) || id.includes(q)) return 1
      return 2
    }
    return sessions
      .filter(s =>
        getDisplayName(s).toLowerCase().includes(q) ||
        s.session_id.toLowerCase().includes(q) ||
        (contentHits ? contentHits.has(s.session_id) : false)
      )
      .map(s => ({ s, rank: rankOf(s) }))
      .sort((a, b) => a.rank - b.rank || b.s.updated_at.localeCompare(a.s.updated_at))
      .map(x => x.s)
  }, [searchActive, query, sessions, getDisplayName, contentHits])

  const { unfiled, grouped } = useMemo(() => {
    const known = new Set(folders.folderOrder)
    const buckets = new Map<string, ManagedSession[]>()
    for (const f of folders.folderOrder) buckets.set(f, [])
    const unfiled: ManagedSession[] = []
    for (const s of sorted) {
      const fn = s.folder_name ?? ''
      if (fn && known.has(fn)) buckets.get(fn)!.push(s)
      else unfiled.push(s)
    }
    const grouped = folders.folderOrder.map(name => ({ name, sessions: buckets.get(name)! }))
    return { unfiled, grouped }
  }, [sorted, folders.folderOrder])

  const toggleFolder = (name: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [name]: !prev[name] }
      saveFolderCollapsed(next)
      return next
    })
  }

  const toggleHarness = (name: string) => {
    setExcludedHarnesses(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveExcludedHarnesses(next)
      return next
    })
  }

  const toggleMachine = (id: string) => {
    setExcludedMachines(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveExcludedMachines(next)
      return next
    })
  }

  const toggleClass = (dim: 'type' | 'purpose' | 'mode' | 'status', value: string) => {
    const [setter, saver] = dim === 'type'
      ? [setExcludedTypes, saveExcludedTypes] as const
      : dim === 'purpose'
        ? [setExcludedPurposes, saveExcludedPurposes] as const
        : dim === 'mode'
          ? [setExcludedModes, saveExcludedModes] as const
          : [setExcludedStatuses, saveExcludedStatuses] as const
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      saver(next)
      return next
    })
  }

  const toggleFilterCollapsed = () => {
    setFilterCollapsed(prev => {
      const next = !prev
      saveFilterCollapsed(next)
      return next
    })
  }

  const clearSessionFilter = () => {
    const reset = (
      setter: React.Dispatch<React.SetStateAction<Set<string>>>,
      saver: (s: Set<string>) => void,
    ) => setter(prev => {
      if (prev.size > 0) saver(new Set())
      return prev.size === 0 ? prev : new Set()
    })
    reset(setExcludedHarnesses, saveExcludedHarnesses)
    reset(setExcludedMachines, saveExcludedMachines)
    reset(setExcludedTypes, saveExcludedTypes)
    reset(setExcludedPurposes, saveExcludedPurposes)
    reset(setExcludedModes, saveExcludedModes)
    reset(setExcludedStatuses, saveExcludedStatuses)
  }

  const openSessionMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ type: 'session', id: sessionId, x: e.clientX, y: e.clientY })
    setShowNewFolder(false)
  }

  const openFolderMenu = (e: React.MouseEvent, name: string) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ type: 'folder', id: name, x: e.clientX, y: e.clientY })
    setShowNewFolder(false)
  }

  const moveToFolder = async (sessionId: string, folder: string) => {
    setCtxMenu(null); setShowNewFolder(false)
    await folders.setSessionFolder(sessionId, folder)
    onAfterFolderChange()
  }

  const handleMarkDone = async (sessionId: string, done: boolean) => {
    setCtxMenu(null); setShowNewFolder(false)
    await folders.markSessionDone(sessionId, done)
    onAfterFolderChange()
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    const targetSession = ctxMenu?.type === 'session' ? ctxMenu.id : null
    setCtxMenu(null); setShowNewFolder(false); setNewFolderName('')
    await folders.createFolder(name)
    if (targetSession) {
      await folders.setSessionFolder(targetSession, name)
      onAfterFolderChange()
    }
  }

  const handleDeleteFolder = async (name: string) => {
    setCtxMenu(null)
    await folders.deleteFolder(name)
    onAfterFolderChange()
  }

  const handlePickInstance = (id: string, mode: SplitMode) => {
    setShowNewMenu(false)
    onNewChat(id, mode)
  }

  // The instance the bare "+ New" button launches into: the most-recently-used
  // one (defaultInstanceId) when it's still enabled, else the first enabled
  // instance. Its harness supplies the emoji/label shown on the button.
  const primaryInstance = useMemo(() => {
    const preferred = defaultInstanceId ? instanceMap.get(defaultInstanceId) : undefined
    if (preferred?.enabled) return preferred
    return instances.find(i => i.enabled)
  }, [defaultInstanceId, instanceMap, instances])
  const primaryHarness = primaryInstance ? harnessMap.get(primaryInstance.harness_type) : undefined
  const primaryMachine = useMemo(
    () => primaryInstance ? machines.find(m => m.id === primaryInstance.machine_id) : undefined,
    [primaryInstance, machines]
  )

  const renderSession = (s: ManagedSession) => {
    const isOpen = openSessionIds.has(s.session_id)
    const isFocused = focusedSessionId === s.session_id
    const tierClass = isFocused
      ? 'bc-session-item-selected'
      : isOpen
        ? 'bc-session-item-open'
        : ''
    const hinfo = harnessMap.get(s.harness)
    const instance = s.instance_id ? instanceMap.get(s.instance_id) : undefined
    const harnessTitle = instance ? `${hinfo?.label || s.harness} — ${instance.name}` : (hinfo?.label || s.harness)
    const sessUIState = getSessionUIState(s)
    const sessTitle = sessUIState.charAt(0).toUpperCase() + sessUIState.slice(1)
    return (
      <div
        key={s.session_id}
        className={`bc-session-item ${tierClass}`}
        onContextMenu={e => openSessionMenu(e, s.session_id)}
      >
        <button className="bc-session-item-main" onClick={() => onSelect(s.session_id)}>
          <span className="bc-session-harness" title={harnessTitle}>
            {hinfo?.image
              ? <img src={`${basePath}${hinfo.image}`} alt="" />
              : <span className="bc-session-harness-emoji">{hinfo?.emoji || '·'}</span>}
          </span>
          <StatusDot state={sessUIState} title={sessTitle} />
          <EditableName
            value={getDisplayName(s)}
            onSave={name => onRename(s.session_id, name)}
            className="bc-session-label"
          />
        </button>
        <SplitButtons
          onSplit={mode => onOpenInSplit(s.session_id, mode)}
          autoTitle="Open session in a new split (auto direction)"
          chooseTitle="Choose split direction for this session"
        />
        <span
          className="bc-session-menu-btn"
          role="button"
          tabIndex={0}
          onClick={e => openSessionMenu(e, s.session_id)}
          title="Move to folder"
        >⋯</span>
      </div>
    )
  }

  // Render a session list capped to SESSION_LIST_CAP rows, with an explicit
  // "show the rest" button when there are more. `key` scopes the reveal so
  // expanding one folder doesn't expand another. Revealing sets the cap to the
  // full length in one click — a deliberate opt-in to the DOM cost.
  const renderCappedList = (key: string, entries: ManagedSession[]) => {
    const cap = listCaps[key] ?? SESSION_LIST_CAP
    if (entries.length <= cap) return entries.map(renderSession)
    const hidden = entries.length - cap
    return (
      <>
        {entries.slice(0, cap).map(renderSession)}
        <button
          className="bc-session-show-more"
          onClick={() => setListCaps(c => ({ ...c, [key]: entries.length }))}
        >
          Show {hidden} more
        </button>
      </>
    )
  }

  const enabledInstanceCount = useMemo(() => instances.filter(i => i.enabled).length, [instances])

  return (
    <div className="bc-session-list">
      <div className="bc-new-session">
        <div className="bc-new-session-wrap">
          <div className="bc-new-session-split">
            {/* Main action: open a new chat in the most-recently-used instance
                (or the first enabled one). No dropdown needed for the common
                case; the caret beside it picks a specific harness/env. */}
            <button
              className="bc-new-session-btn"
              onClick={() => primaryInstance && onNewChat(primaryInstance.id, 'replace')}
              disabled={!connected || !primaryInstance}
              title={primaryInstance
                ? `New chat in ${primaryInstance.name}${primaryHarness ? ` (${primaryHarness.label}` : ''}${primaryMachine ? ` on ${primaryMachine.name})` : primaryHarness ? ')' : ''}`
                : 'No instances configured'}
            >
              <span className="bc-new-session-plus" aria-hidden>+</span>
              <span className="bc-new-session-label">New</span>
              {primaryInstance && (
                <span
                  className="bc-new-session-target"
                  aria-label={`${primaryHarness?.label || primaryInstance.harness_type} on ${primaryMachine?.name || 'machine'}`}
                >
                  {/* Harness icon: the same image the sidebar session rows use;
                      the harness's own emoji only when it has no image. No
                      hardcoded fallback glyph. */}
                  {primaryHarness?.image
                    ? <img className="bc-new-session-target-img" src={`${basePath}${primaryHarness.image}`} alt="" />
                    : primaryHarness?.emoji
                      ? <span className="bc-new-session-target-emoji" aria-hidden>{primaryHarness.emoji}</span>
                      : null}
                  {primaryMachine?.emoji && (
                    <>
                      <span className="bc-new-session-target-at" aria-hidden>@</span>
                      <span className="bc-new-session-target-emoji" aria-hidden>{primaryMachine.emoji}</span>
                    </>
                  )}
                </span>
              )}
            </button>
            <button
              className="bc-new-session-caret-btn"
              onClick={() => setShowNewMenu(s => !s)}
              disabled={!connected || enabledInstanceCount === 0}
              aria-haspopup="menu"
              aria-expanded={showNewMenu}
              title="Choose harness / environment"
              aria-label="Choose harness or environment"
            >
              <span className="bc-new-session-caret" aria-hidden>▾</span>
            </button>
          </div>
          {showNewMenu && (
            <NewSessionMenu
              instances={instances}
              harnesses={harnesses}
              defaultInstanceId={defaultInstanceId}
              basePath={basePath}
              instancesPath={instancesPath}
              onPick={handlePickInstance}
              onClose={() => setShowNewMenu(false)}
            />
          )}
        </div>
        <button className="bc-sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sessions" aria-label="Collapse sessions">◂</button>
      </div>

      <div className="bc-session-search">
        <input
          type="search"
          className="bc-session-search-input"
          placeholder="Search name, id, or message text…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        {searchActive && (
          <span className="bc-session-search-status">
            {searching ? 'searching…' : `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}`}
          </span>
        )}
      </div>

      <HarnessFilterBar
        machines={machines}
        harnesses={harnesses}
        sessions={sessions}
        instanceMachineByID={instanceMachineByID}
        excludedHarnesses={excludedHarnesses}
        excludedMachines={excludedMachines}
        excludedTypes={excludedTypes}
        excludedPurposes={excludedPurposes}
        excludedModes={excludedModes}
        excludedStatuses={excludedStatuses}
        statusOf={statusOf}
        onToggleHarness={toggleHarness}
        onToggleMachine={toggleMachine}
        onToggleClass={toggleClass}
        onClear={clearSessionFilter}
        basePath={basePath}
        collapsed={filterCollapsed}
        onToggleCollapsed={toggleFilterCollapsed}
      />

      {searchActive ? (
        searchResults.length === 0 ? (
          <div className="bc-session-list-empty">
            {searching ? 'Searching…' : 'No sessions match this search'}
          </div>
        ) : (
          renderCappedList('__search__', searchResults)
        )
      ) : (
        <>
          {sorted.length === 0 && (
            <div className="bc-session-list-empty">
              {!connected ? 'Connecting...' : (sessions.length === 0 ? 'No sessions yet' : 'No sessions match the active filter')}
            </div>
          )}

          {renderCappedList('__unfiled__', unfiled)}

          {grouped.map(({ name, sessions: entries }) => {
            const isCollapsed = collapsed[name] ?? false
            const hasActive = entries.some(s => openSessionIds.has(s.session_id))
            return (
              <div key={name}>
                <button
                  className={`bc-folder-header ${hasActive ? 'bc-folder-header-active' : ''}`}
                  onClick={() => toggleFolder(name)}
                  onContextMenu={e => openFolderMenu(e, name)}
                >
                  <span className="bc-folder-chevron">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="bc-folder-icon">📁</span>
                  <span className="bc-folder-name">{name}</span>
                  <span className="bc-folder-count">{entries.length}</span>
                </button>
                {!isCollapsed && renderCappedList(name, entries)}
              </div>
            )
          })}
        </>
      )}

      {ctxMenu && (
        <div
          className="bc-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.type === 'session' && (
            <>
              {(() => {
                const sess = sessions.find(s => s.session_id === ctxMenu.id)
                const current = sess?.folder_name ?? ''
                const isDone = current === ARCHIVE_FOLDER
                return (
                  <>
                    <button
                      className="bc-ctx-menu-item"
                      onClick={() => handleMarkDone(ctxMenu.id, !isDone)}
                    >
                      {isDone ? '↺ Unmark / unarchive' : '✓ Mark done'}
                    </button>
                    <div className="bc-ctx-menu-divider" />
                    <div className="bc-ctx-menu-label">Move to folder</div>
                    {current && !isDone && (
                      <button className="bc-ctx-menu-item" onClick={() => moveToFolder(ctxMenu.id, '')}>
                        ↩ Remove from folder
                      </button>
                    )}
                    {folders.folderOrder.map(f => (
                      <button
                        key={f}
                        className={`bc-ctx-menu-item ${current === f ? 'bc-ctx-menu-item-active' : ''}`}
                        onClick={() => moveToFolder(ctxMenu.id, f)}
                      >📁 {f}</button>
                    ))}
                  </>
                )
              })()}
              {showNewFolder ? (
                <div className="bc-ctx-new-folder">
                  <input
                    ref={newFolderRef}
                    className="bc-ctx-new-folder-input"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateFolder()
                      if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
                    }}
                    placeholder="Folder name"
                  />
                  <button className="bc-ctx-new-folder-btn" onClick={handleCreateFolder}>✓</button>
                </div>
              ) : (
                <button className="bc-ctx-menu-item" onClick={() => setShowNewFolder(true)}>
                  + New folder
                </button>
              )}
            </>
          )}
          {ctxMenu.type === 'folder' && (
            <button className="bc-ctx-menu-item bc-ctx-menu-item-danger" onClick={() => handleDeleteFolder(ctxMenu.id)}>
              Delete folder "{ctxMenu.id}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
