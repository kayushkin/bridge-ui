import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useBridgeSession } from '../useBridgeSession'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeFolders, type UseBridgeFoldersReturn } from '../useBridgeFolders'
import { HARNESS_EMOJI, TRANSPORT_LABEL } from '../constants'
import { formatTokens, formatCost } from '../utils'
import { ToolItem, ToolsSection } from './tools'
import type { HarnessInfo, Message, MessageMeta, SessionInfo } from '../types'

interface StoreModel {
  id: string
  name: string
  provider: string
  enabled: boolean
  max_tokens: number
  input_cost: number
  output_cost: number
}

interface ChatSession {
  frontendId: string
  sessionId: string | null
  harness: string
  agent: string
  displayName: string
}

function generateFrontendId(): string {
  return `fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function generateDefaultAgent(harness: string): string {
  return `${harness}-agent`
}

/* ── Inline Editable Name ── */
function EditableName({ value, onSave, className }: {
  value: string
  onSave: (name: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    setEditing(false)
  }

  if (!editing) {
    return <span className={className} onDoubleClick={() => setEditing(true)} title="Double-click to rename">{value}</span>
  }

  return (
    <input
      ref={inputRef}
      className="bc-inline-edit"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
    />
  )
}

/* ── Message Stats Dropdown ── */
function renderValue(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return `${v}`
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function flattenToRows(obj: Record<string, unknown>, prefix = ''): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  for (const [key, val] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${key}` : key
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      rows.push(...flattenToRows(val as Record<string, unknown>, label))
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const item = val[i]
        if (item != null && typeof item === 'object') {
          rows.push(...flattenToRows(item as Record<string, unknown>, `${label}[${i}]`))
        } else {
          rows.push([`${label}[${i}]`, renderValue(item)])
        }
      }
    } else {
      rows.push([label, renderValue(val)])
    }
  }
  return rows
}

function MessageStats({ meta }: { meta: MessageMeta }) {
  const [open, setOpen] = useState(false)
  const rows = flattenToRows(meta as unknown as Record<string, unknown>)

  return (
    <div className="bc-stats-wrapper">
      <button className="bc-stats-toggle" onClick={() => setOpen(v => !v)}>
        {open ? '\u25BE' : '\u25B8'} Stats ({rows.length})
      </button>
      {open && (
        <div className="bc-stats-dropdown">
          {rows.map(([label, val], i) => (
            <div key={`${label}-${i}`} className="bc-stats-row">
              <span className="bc-stats-label">{label}</span>
              <span className="bc-stats-value">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Inline Thread ── */
function Thread({ messages, loading, uiState, activity, error, agent }: {
  messages: Message[]
  loading: boolean
  uiState: string
  activity: { kind: string; name?: string }
  error: string | null
  agent: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  if (loading) return <div className="bc-thread"><div className="bc-loading">Loading history...</div></div>
  if (messages.length === 0 && !error) return <div className="bc-thread"><div className="bc-empty">Send a message to start</div></div>

  return (
    <div className="bc-thread">
      {error && <div className="bridge-error">{error}</div>}
      {messages.map((m, i) => {
        const tools = m.meta?.tools || []
        const isStreaming = m.role === 'assistant' && !m.done
        return (
          <div key={m.id || i} className={`bc-msg bc-msg-${m.role}`}>
            <div className="bc-msg-role">
              {m.role === 'user' ? 'You' : agent}
            </div>
            {m.thinking && <div className="bc-msg-thinking">{m.thinking}</div>}
            {isStreaming && tools.length > 0 ? (
              <div className="bc-msg-split">
                <div className="bc-msg-split-text">
                  {m.content ? <div className="bc-msg-content">{m.content}</div> : <span className="bc-typing">...</span>}
                </div>
                <div className="bc-msg-split-tools">
                  <div className="bc-split-tools-header">Tools</div>
                  {tools.map((t, ti) => <ToolItem key={ti} tool={t} running={!t.output && !t.error} turnDone={false} />)}
                </div>
              </div>
            ) : (
              <>
                <div className="bc-msg-content">{m.content}</div>
                {tools.length > 0 && (
                  <ToolsSection tools={tools} turnDone={!!m.done} />
                )}
              </>
            )}
            {m.meta && m.role === 'assistant' && m.done && (
              <MessageStats meta={m.meta} />
            )}
          </div>
        )
      })}
      {uiState === 'running' && (
        <div className="bc-activity">
          <span className="bc-activity-dot" />
          {activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'}
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

/* ── Inline Composer ── */
function Composer({ connected, streaming, paused, onSend, onStop, onResume }: {
  connected: boolean
  streaming: boolean
  paused: boolean
  onSend: (text: string) => void
  onStop: () => void
  onResume: () => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const t = text.trim()
    if (!t || !connected || streaming) return
    onSend(t)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  useEffect(() => { if (connected && !streaming) inputRef.current?.focus() }, [connected, streaming])

  return (
    <div className="bc-composer">
      <textarea
        ref={inputRef}
        className="bc-composer-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={connected ? 'Send a message...' : 'Select a session'}
        disabled={!connected || streaming}
        rows={1}
      />
      {streaming ? (
        <button className="bc-composer-btn bc-btn-stop" onClick={onStop}>Stop</button>
      ) : paused ? (
        <button className="bc-composer-btn bc-btn-resume" onClick={onResume}>Resume</button>
      ) : (
        <button className="bc-composer-btn" onClick={handleSubmit} disabled={!text.trim() || !connected}>Send</button>
      )}
    </div>
  )
}

/* ── Inline Session Header ── */
function SessionHeader({ chat, uiState, activity, messages, instance, onRename }: {
  chat: ChatSession | null
  uiState: string
  activity: { kind: string; name?: string }
  messages: Message[]
  instance: { name: string; transport: string } | null
  onRename: (name: string) => void
}) {
  if (!chat || uiState === 'empty') return null

  const completed = messages.filter(m => m.role === 'assistant' && m.done && m.meta)
  const last = completed[completed.length - 1]
  const meta = last?.meta
  let totalCost = 0
  for (const m of completed) totalCost += m.meta?.cost?.total_usd ?? 0

  const contextTokens = meta?.usage?.context_tokens ?? 0
  const contextLimit = meta?.usage?.context_limit ?? 200_000
  const contextPct = contextTokens && contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0

  return (
    <div className="bc-header">
      <div className="bc-header-row">
        <span className={`bc-state-badge bc-state-${uiState}`}>
          {uiState === 'running' && <span className="bc-pulse" />}
          {uiState.charAt(0).toUpperCase() + uiState.slice(1)}
        </span>
        <EditableName value={chat.displayName} onSave={onRename} className="bc-session-name" />
        {meta?.model && <span className="bc-model-badge">{String(meta.model)}</span>}
        {instance && <span className="bc-instance-badge">{instance.name} ({instance.transport})</span>}
        <span className="bc-spacer" />
        {totalCost > 0 && <span className="bc-cost">{formatCost(totalCost)}</span>}
      </div>
      {contextTokens > 0 && (
        <div className="bc-context-row">
          <span className="bc-context-label">{formatTokens(contextTokens)} / {formatTokens(contextLimit)} ({contextPct}%)</span>
          <div className="bc-context-bar">
            <div className={`bc-bar-fill ${contextPct >= 90 ? 'bc-bar-crit' : contextPct >= 70 ? 'bc-bar-warn' : ''}`} style={{ width: `${contextPct}%` }} />
          </div>
        </div>
      )}
      {activity.kind !== 'idle' && uiState === 'running' && (
        <div className="bc-activity-row">
          <span className="bc-activity-dot" />
          {activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'}
        </div>
      )}
    </div>
  )
}

/* ── Inline HarnessTabBar ── */
function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath }: {
  instances: Array<{ id: string; name: string; harness_type: string; host: string; transport: string; enabled: boolean }>
  harnesses: HarnessInfo[]
  sessions: Array<{ instance_id?: string; state: string }>
  selectedInstance: string
  onSelect: (id: string) => void
  onNewInstance: () => void
  basePath: string
  instancesPath: string
}) {
  const harnessMap = useMemo(() => {
    const map = new Map<string, HarnessInfo>()
    for (const h of harnesses) map.set(h.name, h)
    return map
  }, [harnesses])

  const groups = useMemo(() => {
    const groupMap = new Map<string, typeof instances>()
    for (const inst of instances) {
      if (!inst.enabled) continue
      const list = groupMap.get(inst.harness_type) || []
      list.push(inst)
      groupMap.set(inst.harness_type, list)
    }
    const order = harnesses.map(h => h.name)
    return Array.from(groupMap.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [instances, harnesses])

  const instanceMeta = useMemo(() => {
    const meta = new Map<string, { running: number; total: number }>()
    for (const inst of instances) {
      const s = sessions.filter(s => s.instance_id === inst.id)
      meta.set(inst.id, { running: s.filter(s => s.state === 'running').length, total: s.length })
    }
    return meta
  }, [instances, sessions])

  if (groups.length === 0) {
    return (
      <div className="htb-wrapper">
        <div className="htb-empty">No harness instances configured. <Link to={instancesPath}>Add an instance</Link> to get started.</div>
        <button className="htb-new-instance" onClick={onNewInstance} title="Add new instance">+</button>
      </div>
    )
  }

  return (
    <div className="htb-wrapper">
      <div className="htb-tabs">
        {groups.map(([harnessType, groupInstances], gi) => {
          const info = harnessMap.get(harnessType)
          return (
            <div key={harnessType} className="htb-group">
              {gi > 0 && <div className="htb-sep" />}
              {groups.length > 1 && (
                <div className="htb-group-label">
                  {info?.image
                    ? <img className="htb-group-img" src={`${basePath}${info.image}`} alt={info?.label || harnessType} />
                    : <span>{info?.emoji || HARNESS_EMOJI[harnessType] || ''}</span>}
                </div>
              )}
              {groupInstances.map(inst => {
                const m = instanceMeta.get(inst.id)
                const isActive = selectedInstance === inst.id
                const available = info?.available ?? false
                return (
                  <button
                    key={inst.id}
                    className={`htb-tab ${isActive ? 'htb-tab-active' : ''} ${!available ? 'htb-tab-disabled' : ''}`}
                    onClick={() => available && onSelect(inst.id)}
                    disabled={!available}
                    title={`${inst.name} (${TRANSPORT_LABEL[inst.transport] || inst.transport} - ${inst.host})`}
                  >
                    <div className="htb-tab-line1">
                      <span className={`htb-avail ${available ? 'htb-avail-on' : 'htb-avail-off'}`} />
                      {groups.length <= 1 && (info?.image
                        ? <img className="htb-tab-img" src={`${basePath}${info.image}`} alt="" />
                        : <span className="htb-tab-emoji">{info?.emoji || HARNESS_EMOJI[harnessType] || ''}</span>)}
                      <span className="htb-tab-name">{inst.name}</span>
                      <span className="htb-transport">{TRANSPORT_LABEL[inst.transport] || inst.transport}</span>
                    </div>
                    {m && (
                      <div className="htb-tab-line2">
                        {m.running > 0 ? `${m.running} running` : m.total > 0 ? `${m.total} sess` : 'no sessions'}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
        <button className="htb-new-instance" onClick={onNewInstance} title="Add new instance">+</button>
      </div>
    </div>
  )
}

/* ── Inline Session List ── */

const COLLAPSED_KEY = 'bridge-folder-collapsed'

function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') } catch { return {} }
}
function saveCollapsed(next: Record<string, boolean>) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

interface SidebarSession {
  bridge_id: string
  agent_id?: string
  display_name: string
  harness: string
  state: string
  updated_at: string
  folder_name?: string
}

interface CtxMenuState {
  type: 'session' | 'folder'
  id: string
  x: number
  y: number
}

function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange }: {
  sessions: SidebarSession[]
  activeSession: string
  onSelect: (id: string) => void
  onNewSession: () => void
  connected: boolean
  getDisplayName: (session: SidebarSession) => string
  onRename: (id: string, name: string) => void
  folders: UseBridgeFoldersReturn
  onAfterFolderChange: () => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
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
      saveCollapsed(next)
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

/* ── System Prompt Modal ── */
function SystemPromptModal({ info, onClose }: {
  info: SessionInfo
  onClose: () => void
}) {
  const hasPrompt = !!info.system_prompt || !!info.append_system_prompt
  return (
    <div className="bc-modal-overlay" onClick={onClose}>
      <div className="bc-modal" onClick={e => e.stopPropagation()}>
        <div className="bc-modal-header">
          <h3>System Prompt</h3>
          <button className="bc-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="bc-modal-body">
          {info.working_dir && (
            <div className="bc-info-row"><span className="bc-info-label">Working directory</span><code>{info.working_dir}</code></div>
          )}
          {info.model && (
            <div className="bc-info-row"><span className="bc-info-label">Model</span><code>{info.model}</code></div>
          )}
          {info.permission_mode && (
            <div className="bc-info-row"><span className="bc-info-label">Permission mode</span><code>{info.permission_mode}</code></div>
          )}
          {info.system_prompt && (
            <>
              <div className="bc-info-label">System prompt (replaces default)</div>
              <pre className="bc-prompt-block">{info.system_prompt}</pre>
            </>
          )}
          {info.append_system_prompt && (
            <>
              <div className="bc-info-label">Appended to default system prompt</div>
              <pre className="bc-prompt-block">{info.append_system_prompt}</pre>
            </>
          )}
          {!hasPrompt && (
            <div className="bc-info-empty">
              No custom system prompt was set at session start. The agent is running with its default prompt plus any CLAUDE.md files it discovers in the working directory.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Tools Panel ── */
function ToolsPanel({ info }: { info: SessionInfo }) {
  const tools = info.tools ?? []
  const slashCommands = info.slash_commands ?? []
  const agents = info.agents ?? []
  const skills = info.skills ?? []
  const mcpServers = info.mcp_servers ?? []

  if (tools.length === 0 && slashCommands.length === 0 && agents.length === 0 && skills.length === 0 && mcpServers.length === 0) {
    return <div className="bc-tools-panel"><div className="bc-info-empty">No tools reported yet. The harness will emit this after its first init.</div></div>
  }

  return (
    <div className="bc-tools-panel">
      {tools.length > 0 && (
        <div className="bc-tools-section">
          <div className="bc-tools-section-header">Tools ({tools.length})</div>
          <div className="bc-tools-grid">
            {tools.map(t => (
              <span key={t.name} className="bc-tool-chip" title={t.description || undefined}>{t.name}</span>
            ))}
          </div>
        </div>
      )}
      {slashCommands.length > 0 && (
        <div className="bc-tools-section">
          <div className="bc-tools-section-header">Slash commands ({slashCommands.length})</div>
          <div className="bc-tools-grid">
            {slashCommands.map(c => <span key={c} className="bc-tool-chip">/{c}</span>)}
          </div>
        </div>
      )}
      {agents.length > 0 && (
        <div className="bc-tools-section">
          <div className="bc-tools-section-header">Sub-agents ({agents.length})</div>
          <div className="bc-tools-grid">
            {agents.map(a => <span key={a} className="bc-tool-chip">{a}</span>)}
          </div>
        </div>
      )}
      {skills.length > 0 && (
        <div className="bc-tools-section">
          <div className="bc-tools-section-header">Skills ({skills.length})</div>
          <div className="bc-tools-grid">
            {skills.map(s => <span key={s} className="bc-tool-chip">{s}</span>)}
          </div>
        </div>
      )}
      {mcpServers.length > 0 && (
        <div className="bc-tools-section">
          <div className="bc-tools-section-header">MCP servers ({mcpServers.length})</div>
          <div className="bc-tools-grid">
            {mcpServers.map(m => (
              <span key={m.name} className="bc-tool-chip" title={m.status || undefined}>
                {m.name}{m.status ? ` · ${m.status}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── New Instance Modal ── */
function NewInstanceForm({ harnesses, onCreate, onCancel }: {
  harnesses: HarnessInfo[]
  onCreate: (data: { name: string; harness_type: string; host: string; transport: 'local' | 'ssh'; working_dir: string; max_concurrent_sessions: number }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: '', harness_type: harnesses[0]?.name || 'claude_code', host: 'localhost',
    transport: 'local' as 'local' | 'ssh', working_dir: '', max_concurrent_sessions: 1,
  })

  return (
    <div className="bc-new-inst-overlay" onClick={onCancel}>
      <div className="bc-new-inst-form" onClick={e => e.stopPropagation()}>
        <h3>New Instance</h3>
        <label><span>Name</span><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-instance" /></label>
        <label><span>Harness</span>
          <select value={form.harness_type} onChange={e => setForm(f => ({ ...f, harness_type: e.target.value }))}>
            {harnesses.map(h => <option key={h.name} value={h.name}>{h.label || h.name}</option>)}
          </select>
        </label>
        <label><span>Host</span><input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="localhost" /></label>
        <label><span>Transport</span>
          <select value={form.transport} onChange={e => setForm(f => ({ ...f, transport: e.target.value as 'local' | 'ssh' }))}>
            <option value="local">Local</option>
            <option value="ssh">SSH</option>
          </select>
        </label>
        <label><span>Working Dir</span><input value={form.working_dir} onChange={e => setForm(f => ({ ...f, working_dir: e.target.value }))} placeholder="/home/user/project" /></label>
        <label><span>Max Sessions</span><input type="number" value={form.max_concurrent_sessions} onChange={e => setForm(f => ({ ...f, max_concurrent_sessions: parseInt(e.target.value) || 1 }))} min={1} /></label>
        <div className="bc-new-inst-actions">
          <button onClick={() => { if (form.name.trim()) onCreate(form) }} disabled={!form.name.trim()}>Create</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Main BridgeChat ── */
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
  const pendingConfigRef = useRef<{ model?: string; effort?: string } | null>(null)

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

  return (
    <div className="bc-container">
      <HarnessTabBar
        instances={instances.instances}
        harnesses={harnesses}
        sessions={bridge.sessions}
        selectedInstance={selectedInstance}
        onSelect={selectInstance}
        onNewInstance={() => setShowNewInstance(true)}
        basePath={basePath}
        instancesPath={routes.instances}
      />
      <div className="bc-main">
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
        />
        <div className="bc-chat-area">
          <SessionHeader
            chat={activeChat}
            uiState={bridge.uiState}
            activity={bridge.activity}
            messages={bridge.messages}
            instance={activeInstance}
            onRename={name => activeChat?.sessionId && handleRenameSession(activeChat.sessionId, name)}
          />
          <Thread
            messages={bridge.messages}
            loading={bridge.loadingHistory}
            uiState={bridge.uiState}
            activity={bridge.activity}
            error={bridge.error}
            agent={activeChat?.agent ?? ''}
          />
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
