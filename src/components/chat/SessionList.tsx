import { useEffect, useMemo, useRef, useState } from 'react'
import type { UseBridgeFoldersReturn } from '../../useBridgeFolders'
import { EditableName } from './EditableName'
import { loadFolderCollapsed, saveFolderCollapsed } from './persistence'
import type { CtxMenuState, SidebarSession } from './types'

export function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
  sessions: SidebarSession[]
  activeSession: string
  onSelect: (id: string) => void
  onNewSession: () => void
  connected: boolean
  getDisplayName: (session: SidebarSession) => string
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

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => { setCtxMenu(null); setShowNewFolder(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  useEffect(() => {
    if (showNewFolder) newFolderRef.current?.focus()
  }, [showNewFolder])

  const sorted = useMemo(() =>
    [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [sessions]
  )

  const { unfiled, grouped } = useMemo(() => {
    const known = new Set(folders.folderOrder)
    const buckets = new Map<string, SidebarSession[]>()
    for (const f of folders.folderOrder) buckets.set(f, [])
    const unfiled: SidebarSession[] = []
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

  const renderSession = (s: SidebarSession) => (
    <button
      key={s.bridge_id}
      className={`bc-session-item ${s.bridge_id === activeSession ? 'bc-session-item-active' : ''}`}
      onClick={() => onSelect(s.bridge_id)}
      onContextMenu={e => openSessionMenu(e, s.bridge_id)}
    >
      <span className={`bc-sdot bc-sdot-${s.state}`} />
      <EditableName
        value={getDisplayName(s)}
        onSave={name => onRename(s.bridge_id, name)}
        className="bc-session-label"
      />
      <span
        className="bc-session-menu-btn"
        role="button"
        tabIndex={0}
        onClick={e => openSessionMenu(e, s.bridge_id)}
        title="Move to folder"
      >⋯</span>
    </button>
  )

  return (
    <div className="bc-session-list">
      <div className="bc-new-session">
        <button className="bc-new-session-btn" onClick={onNewSession} disabled={!connected}>+ New Session</button>
        <button className="bc-sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sessions" aria-label="Collapse sessions">◂</button>
      </div>
      {sorted.length === 0 && (
        <div className="bc-session-list-empty">{connected ? 'No sessions yet' : 'Connecting...'}</div>
      )}

      {unfiled.map(renderSession)}

      {grouped.map(({ name, sessions: entries }) => {
        const isCollapsed = collapsed[name] ?? false
        const hasActive = entries.some(s => s.bridge_id === activeSession)
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
            {!isCollapsed && entries.map(renderSession)}
          </div>
        )
      })}

      {ctxMenu && (
        <div
          className="bc-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {ctxMenu.type === 'session' && (
            <>
              <div className="bc-ctx-menu-label">Move to folder</div>
              {(() => {
                const sess = sessions.find(s => s.bridge_id === ctxMenu.id)
                const current = sess?.folder_name ?? ''
                return (
                  <>
                    {current && (
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
