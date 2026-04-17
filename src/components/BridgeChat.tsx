import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useBridgeSession } from '../useBridgeSession'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeInstances } from '../useBridgeInstances'
import { HARNESS_EMOJI, TRANSPORT_LABEL } from '../constants'
import { formatTokens, formatCost } from '../utils'
import { ToolItem } from './tools'
import type { HarnessInfo, Message, MessageMeta } from '../types'

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
        const tools = (m.meta?.tools || []) as Array<{ tool: string; input?: string; output?: string; error?: boolean }>
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
                  {tools.map((t, ti) => <ToolItem key={ti} tool={t} running={!t.output && !t.error} />)}
                </div>
              </div>
            ) : (
              <>
                <div className="bc-msg-content">{m.content}</div>
                {tools.length > 0 && (
                  <div className="bc-msg-tools">
                    {tools.map((t, ti) => (
                      <ToolItem key={ti} tool={t} running={false} />
                    ))}
                  </div>
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
function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename }: {
  sessions: Array<{ bridge_id: string; agent_id?: string; display_name: string; harness: string; state: string; updated_at: string }>
  activeSession: string
  onSelect: (id: string) => void
  onNewSession: () => void
  connected: boolean
  getDisplayName: (session: { bridge_id: string; agent_id?: string; display_name: string; harness: string }) => string
  onRename: (id: string, name: string) => void
}) {
  const sorted = useMemo(() =>
    [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [sessions]
  )

  return (
    <div className="bc-session-list">
      <div className="bc-new-session">
        <button className="bc-new-session-btn" onClick={onNewSession} disabled={!connected}>+ New Session</button>
      </div>
      {sorted.length === 0 && (
        <div className="bc-session-list-empty">{connected ? 'No sessions yet' : 'Connecting...'}</div>
      )}
      {sorted.map(s => (
        <button
          key={s.bridge_id}
          className={`bc-session-item ${s.bridge_id === activeSession ? 'bc-session-item-active' : ''}`}
          onClick={() => onSelect(s.bridge_id)}
        >
          <span className={`bc-sdot bc-sdot-${s.state}`} />
          <EditableName
            value={getDisplayName(s)}
            onSave={name => onRename(s.bridge_id, name)}
            className="bc-session-label"
          />
        </button>
      ))}
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
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [storeModels, setStoreModels] = useState<StoreModel[]>([])
  const [configModel, setConfigModel] = useState('')
  const [configEffort, setConfigEffort] = useState('')
  const [showNewInstance, setShowNewInstance] = useState(false)
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
    const customName = bridgePrefs.getSessionName(sess.bridge_id)
    const displayName = customName || sess.display_name || agent
    setActiveChat({
      frontendId: sess.client_id || `fe_${sess.bridge_id}`,
      sessionId: sess.bridge_id,
      harness: sess.harness,
      agent,
      displayName,
    })
  }, [bridge.activeSession, bridgePrefs])

  const getDisplayName = useCallback((session: { bridge_id: string; agent_id?: string; display_name: string; harness: string }): string => {
    const customName = bridgePrefs.getSessionName(session.bridge_id)
    if (customName) return customName
    if (session.display_name) return session.display_name
    if (session.agent_id) return session.agent_id
    return generateDefaultAgent(session.harness)
  }, [bridgePrefs])

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
    const instanceName = instances.instanceMap.get(selectedInstance)?.name ?? agentId

    setActiveChat({
      frontendId,
      sessionId: null,
      harness: selectedHarness,
      agent: agentId,
      displayName: instanceName,
    })

    const sess = await bridge.createSession({
      harness: selectedHarness,
      instanceId: selectedInstance,
      agentId,
      displayName: instanceName,
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
  }, [bridge, bridgePrefs, selectedInstance, selectedHarness, instances.instanceMap])

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
    bridgePrefs.setSessionName(id, name)
  }, [bridgePrefs])

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
              </>
            )}
          </div>
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
    </div>
  )
}
