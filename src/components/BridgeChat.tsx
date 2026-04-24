import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useBridgeSession } from '../useBridgeSession'
import { useBridgePrefs } from '../useBridgePrefs'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeFolders, type UseBridgeFoldersReturn } from '../useBridgeFolders'
import { useStickyBottomScroll } from '../useStickyBottomScroll'
import { HARNESS_EMOJI, TRANSPORT_LABEL } from '../constants'
import { formatTokens, formatCost } from '../utils'
import { ToolsSection, ToolContext } from './tools'
import { GitPanel } from './GitPanel'
import type { HarnessInfo, LogRow, LogRowActor, MessageMeta, SessionInfo, TokenUsage, ToolEvent } from '../types'

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

/* ── Collapse state persistence ── */
const COLLAPSE_KEY = 'bridge-ui-collapse'
interface CollapseState {
  harnessBar: boolean
  sessionList: boolean
  turns: boolean
  thread: boolean
  timeline: boolean
  git: boolean
}
function loadCollapseState(): CollapseState {
  try {
    const s = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')
    return {
      harnessBar: !!s.harnessBar,
      sessionList: !!s.sessionList,
      turns: !!s.turns,
      thread: !!s.thread,
      // Timeline defaults to collapsed so existing users keep the previous layout
      // until they opt in.
      timeline: s.timeline === undefined ? true : !!s.timeline,
      // Git defaults to collapsed for the same reason.
      git: s.git === undefined ? true : !!s.git,
    }
  } catch { return { harnessBar: false, sessionList: false, turns: false, thread: false, timeline: true, git: true } }
}
function saveCollapseState(s: CollapseState) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
// When a user collapses a chat split pane and every other pane is already
// collapsed, the chat area would be blank — auto-expand one so there's always
// something visible.
function ensureOneChatPaneOpen(s: CollapseState): CollapseState {
  if (!s.turns || !s.thread || !s.timeline || !s.git) return s
  return { ...s, thread: false }
}

/* ── Split pane sizing (flex-grow per pane, drag-adjustable) ── */
const SIZES_KEY = 'bridge-ui-split-sizes'
type PaneKey = 'turns' | 'thread' | 'timeline' | 'git'
type PaneSizes = Record<PaneKey, number>
const DEFAULT_PANE_SIZES: PaneSizes = { turns: 1, thread: 1, timeline: 1, git: 1 }
function loadPaneSizes(): PaneSizes {
  try {
    const raw = JSON.parse(localStorage.getItem(SIZES_KEY) || '{}')
    const pick = (k: PaneKey) => (typeof raw[k] === 'number' && raw[k] > 0 ? raw[k] : 1)
    return { turns: pick('turns'), thread: pick('thread'), timeline: pick('timeline'), git: pick('git') }
  } catch { return { ...DEFAULT_PANE_SIZES } }
}
function savePaneSizes(s: PaneSizes) {
  try { localStorage.setItem(SIZES_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function SplitResizer({ leftKey, rightKey, containerRef, setSizes }: {
  leftKey: PaneKey
  rightKey: PaneKey
  containerRef: React.RefObject<HTMLDivElement | null>
  setSizes: React.Dispatch<React.SetStateAction<PaneSizes>>
}) {
  const [dragging, setDragging] = useState(false)
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const leftEl = container.querySelector(`[data-pane="${leftKey}"]`) as HTMLElement | null
    const rightEl = container.querySelector(`[data-pane="${rightKey}"]`) as HTMLElement | null
    if (!leftEl || !rightEl) return

    const startX = e.clientX
    const pairWidth = leftEl.getBoundingClientRect().width + rightEl.getBoundingClientRect().width
    let startLeft = 0
    let startRight = 0
    setSizes(prev => { startLeft = prev[leftKey]; startRight = prev[rightKey]; return prev })
    const totalGrow = startLeft + startRight
    if (totalGrow <= 0 || pairWidth <= 0) return
    const pixelsPerGrow = pairWidth / totalGrow
    const MIN_PX = 180
    const minGrow = Math.min(MIN_PX / pixelsPerGrow, totalGrow / 2)

    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const growDelta = dx / pixelsPerGrow
      let newLeft = startLeft + growDelta
      let newRight = startRight - growDelta
      if (newLeft < minGrow) { newLeft = minGrow; newRight = totalGrow - minGrow }
      if (newRight < minGrow) { newRight = minGrow; newLeft = totalGrow - minGrow }
      setSizes(prev => ({ ...prev, [leftKey]: newLeft, [rightKey]: newRight }))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [leftKey, rightKey, containerRef, setSizes])

  const onDoubleClick = useCallback(() => {
    setSizes(prev => ({ ...prev, [leftKey]: 1, [rightKey]: 1 }))
  }, [leftKey, rightKey, setSizes])

  return (
    <div
      className={`bc-split-resizer${dragging ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize — double-click to reset"
    />
  )
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

function shouldExpandByDefault(row: LogRow): boolean {
  if (row.actor === 'user') return true
  // Assistant text bubbles expand so the user sees the response without
  // clicking; result rows expand to surface usage/cost; everything else
  // (thinking, tool, system, etc.) collapses to keep the log compact.
  if (row.kind === 'text' && row.text) return true
  return !!row.meta || row.kind === 'result'
}

function groupEventsByType(events: Array<Record<string, unknown>>): Array<{ type: string; events: Array<Record<string, unknown>> }> {
  const order: string[] = []
  const buckets: Record<string, Array<Record<string, unknown>>> = {}
  for (const e of events) {
    const t = String((e as { type?: unknown }).type ?? 'unknown') || 'unknown'
    if (!(t in buckets)) { buckets[t] = []; order.push(t) }
    buckets[t].push(e)
  }
  return order.map(t => ({ type: t, events: buckets[t] }))
}

function formatHMS(ts: string): string {
  try {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch { return ts }
}

function idTail(id: string, n = 10): string {
  return id.length > n ? `…${id.slice(-n)}` : id
}

function UsageLine({ usage }: { usage: TokenUsage }) {
  const parts: string[] = []
  if (usage.input_tokens) parts.push(`in ${formatTokens(usage.input_tokens)}`)
  if (usage.output_tokens) parts.push(`out ${formatTokens(usage.output_tokens)}`)
  if (usage.cache_read_tokens) parts.push(`cache-read ${formatTokens(usage.cache_read_tokens)}`)
  if (usage.cache_write_tokens) parts.push(`cache-write ${formatTokens(usage.cache_write_tokens)}`)
  if (parts.length === 0) return null
  return <div className="bc-row-usage">{parts.join(' · ')}</div>
}

/* ── Inline LogRow ── */
function LogRowView({ row, agent }: { row: LogRow; agent: string }) {
  const actorLabel = row.actor === 'user' ? 'You' : row.actor === 'system' ? 'system' : agent
  // With the split-by-kind reducer, every event in a row shares the same kind
  // so the label reads from row.kind directly. Subtypes on system/thinking
  // rows still disambiguate (e.g. system.task_progress).
  const typeLabel = row.subtype ? `${row.kind}.${row.subtype}` : row.kind
  const hasStructuredBody = !!(row.text || row.thinking || (row.tools && row.tools.length > 0)
    || row.usage || row.meta || row.systemMessage || row.systemFields
    || row.stateTransition || row.sessionInfo || row.errorMessage)
  const hasRaw = !!(row.events && row.events.length > 0)
  const canExpand = hasStructuredBody || hasRaw

  // User messages and the result row are expanded by default; everything
  // else collapses so the log stays compact.
  const [collapsed, setCollapsed] = useState<boolean>(() => !shouldExpandByDefault(row))
  // When a row has no structured body, expanding it auto-reveals raw —
  // otherwise the user would have to click twice to see anything.
  const [showRaw, setShowRaw] = useState<boolean>(() => !hasStructuredBody && hasRaw)

  return (
    <div className={`bc-row bc-row-${row.actor}`}>
      <div className="bc-row-header" onClick={() => canExpand && setCollapsed(c => !c)}>
        <span className="bc-row-ts">{formatHMS(row.timestamp)}</span>
        <span className="bc-row-type">{typeLabel}</span>
        <span className="bc-row-actor">{actorLabel}</span>
        <span className="bc-row-ids">
          {row.clientId && <code title="client id" className="bc-row-id bc-row-id-cli">cli:{idTail(row.clientId)}</code>}
          {row.clientRequestId && <code title="caller's per-turn request id" className="bc-row-id bc-row-id-req">req:{idTail(row.clientRequestId)}</code>}
          {row.turnId && <code title="bridge-server turn_id" className="bc-row-id bc-row-id-turn">turn:{idTail(row.turnId)}</code>}
          {row.messageId && <code title="bridge-server message_id" className="bc-row-id bc-row-id-srv">srv:{idTail(row.messageId)}</code>}
          {row.harnessMessageId && <code title="harness completion id" className="bc-row-id bc-row-id-hid">hid:{idTail(row.harnessMessageId)}</code>}
          {row.toolUseId && <code title="harness tool_use id" className="bc-row-id bc-row-id-tu">tu:{idTail(row.toolUseId)}</code>}
        </span>
        {canExpand && <span className="bc-row-collapse">{collapsed ? '▸' : '▾'}</span>}
      </div>
      {!collapsed && (
        <div className="bc-row-body">
          {row.text && <div className="bc-row-text">{row.text}</div>}
          {row.thinking && (
            <details className="bc-row-thinking">
              <summary>thinking</summary>
              <div className="bc-row-thinking-text">{row.thinking}</div>
            </details>
          )}
          {row.tools && row.tools.length > 0 && (
            <ToolsSection tools={row.tools} turnDone={!!row.done} />
          )}
          {row.usage && <UsageLine usage={row.usage} />}
          {row.meta && <MessageStats meta={row.meta} />}
          {row.systemMessage && <div className="bc-row-system">{row.systemMessage}</div>}
          {row.systemFields && (
            <pre className="bc-row-json">{JSON.stringify(row.systemFields, null, 2)}</pre>
          )}
          {row.stateTransition && (
            <div className="bc-row-state">
              {row.stateTransition.from ?? '—'} → <strong>{row.stateTransition.to}</strong>
              {row.stateTransition.reason ? ` (${row.stateTransition.reason})` : ''}
            </div>
          )}
          {row.sessionInfo && (
            <details className="bc-row-info">
              <summary>session info</summary>
              <pre className="bc-row-json">{JSON.stringify(row.sessionInfo, null, 2)}</pre>
            </details>
          )}
          {row.errorMessage && <div className="bc-row-error">{row.errorMessage}</div>}
          {hasRaw && (
            <div className="bc-row-raw-wrap">
              <button className="bc-row-raw-toggle" onClick={e => { e.stopPropagation(); setShowRaw(s => !s) }}>
                {showRaw ? 'hide raw' : `raw (${row.events.length})`}
              </button>
              {showRaw && (
                <div className="bc-row-raw-groups">
                  {groupEventsByType(row.events).map(g => (
                    <details key={g.type} className="bc-row-raw-group">
                      <summary>{g.type} ({g.events.length})</summary>
                      <pre className="bc-row-json">{JSON.stringify(g.events, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Turn grouping ──
 *
 * Rows that share a bridge-server turn_id (user_message → result/error and
 * every event in between) collapse into one TurnGroup. Rows without a turn_id
 * (session_info, session_state between turns, stray system events) render
 * standalone. Filtering runs first, then grouping — so hiding a type only
 * affects what's inside the group, not the group boundary.
 */
type TurnBlock =
  | { kind: 'turn'; turnId: string; rows: LogRow[] }
  | { kind: 'standalone'; row: LogRow }

function groupRowsByTurn(rows: LogRow[]): TurnBlock[] {
  const out: TurnBlock[] = []
  let current: { kind: 'turn'; turnId: string; rows: LogRow[] } | null = null
  for (const r of rows) {
    if (r.turnId) {
      if (current && current.turnId === r.turnId) {
        current.rows.push(r)
      } else {
        if (current) out.push(current)
        current = { kind: 'turn', turnId: r.turnId, rows: [r] }
      }
    } else {
      if (current) { out.push(current); current = null }
      out.push({ kind: 'standalone', row: r })
    }
  }
  if (current) out.push(current)
  return out
}

function turnSummary(rows: LogRow[]): { userText?: string; toolCount: number; done: boolean; errored: boolean; totalUsage?: TokenUsage } {
  let userText: string | undefined
  let toolCount = 0
  let done = false
  let errored = false
  let totalUsage: TokenUsage | undefined
  for (const r of rows) {
    if (r.actor === 'user' && !userText && r.text) userText = r.text
    if (r.tools) toolCount += r.tools.length
    if (r.eventType === 'result' && r.done) { done = true; totalUsage = r.usage ?? r.meta?.usage ?? totalUsage }
    if (r.errorMessage) { errored = true; done = true }
  }
  return { userText, toolCount, done, errored, totalUsage }
}

function TurnGroupView({ turnId, rows, agent }: { turnId: string; rows: LogRow[]; agent: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const summary = useMemo(() => turnSummary(rows), [rows])
  const snippet = summary.userText
    ? (summary.userText.length > 80 ? summary.userText.slice(0, 80) + '…' : summary.userText)
    : '(no user text)'

  return (
    <div className={`bc-turn${summary.errored ? ' bc-turn-error' : summary.done ? ' bc-turn-done' : ' bc-turn-live'}`}>
      <div className="bc-turn-header" onClick={() => setCollapsed(c => !c)}>
        <span className="bc-turn-chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="bc-turn-label">Turn</span>
        <code className="bc-row-id bc-row-id-turn" title="bridge-server turn_id">turn:{idTail(turnId)}</code>
        <span className="bc-turn-snippet">{snippet}</span>
        <span className="bc-turn-spacer" />
        <span className="bc-turn-count">{rows.length} event{rows.length === 1 ? '' : 's'}</span>
        {summary.toolCount > 0 && <span className="bc-turn-tools">{summary.toolCount} tool{summary.toolCount === 1 ? '' : 's'}</span>}
        {summary.totalUsage && <UsageLine usage={summary.totalUsage} />}
        {!summary.done && <span className="bc-turn-running"><span className="bc-pulse" /> running</span>}
      </div>
      {!collapsed && (
        <div className="bc-turn-body">
          {rows.map(row => <LogRowView key={row.key} row={row} agent={agent} />)}
        </div>
      )}
    </div>
  )
}

/* ── Type filter ── */
const FILTER_KEY = 'bridge-ui-type-filter'

function loadHiddenTypes(): Set<string> {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch { return new Set() }
}

function saveHiddenTypes(s: Set<string>) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
}

function typesInRow(row: LogRow): string[] {
  // After the split-by-kind reducer each row belongs to exactly one kind, so
  // filter chips key off row.kind — more useful to users than raw event
  // types (stream/tool_call/tool_result collapse into text/thinking/tool).
  return [row.kind]
}

function FilterBar({ types, hidden, onToggle }: {
  types: string[]
  hidden: Set<string>
  onToggle: (t: string) => void
}) {
  if (types.length === 0) return null
  return (
    <div className="bc-filter-bar">
      <span className="bc-filter-label">show:</span>
      {types.map(t => {
        const on = !hidden.has(t)
        return (
          <button
            key={t}
            type="button"
            className={`bc-filter-chip${on ? ' bc-filter-chip-on' : ''}`}
            onClick={() => onToggle(t)}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

/* ── Turns View ──
 *
 * Strips the event log down to the conversational backbone: user messages and
 * the final assistant result (or error) for each turn. Rendered in order,
 * with actor-styled bubbles and a small meta line for results.
 */
interface TurnsItem {
  key: string
  actor: LogRowActor
  text: string
  ts: string
  turnId?: string
  usage?: TokenUsage
  isError?: boolean
}

function rowsToTurns(rows: LogRow[]): TurnsItem[] {
  const out: TurnsItem[] = []
  for (const row of rows) {
    if (row.kind === 'user_message' && row.text) {
      out.push({
        key: `tv_user_${row.key}`,
        actor: 'user',
        text: row.text,
        ts: row.timestamp,
        turnId: row.turnId,
      })
    } else if (row.kind === 'result' && row.done) {
      const text = row.text || row.meta?.text
      if (text) {
        out.push({
          key: `tv_res_${row.key}`,
          actor: 'assistant',
          text,
          ts: row.timestamp,
          turnId: row.turnId,
          usage: row.usage || row.meta?.usage,
          isError: row.meta?.is_error,
        })
      }
    } else if (row.kind === 'error' && row.errorMessage) {
      out.push({
        key: `tv_err_${row.key}`,
        actor: 'assistant',
        text: row.errorMessage,
        ts: row.timestamp,
        turnId: row.turnId,
        isError: true,
      })
    }
  }
  return out
}

function TurnsView({ rows, agent, onToggleCollapse, style, paneKey }: {
  rows: LogRow[]
  agent: string
  onToggleCollapse: () => void
  style?: React.CSSProperties
  paneKey?: string
}) {
  const { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom } = useStickyBottomScroll<HTMLDivElement>()
  const items = useMemo(() => rowsToTurns(rows), [rows])
  useEffect(() => { autoScrollIfAtBottom() }, [items.length, autoScrollIfAtBottom])

  const onHeaderKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() }
  }, [onToggleCollapse])

  return (
    <div className="bc-turns-pane" style={style} data-pane={paneKey}>
      <div
        className="bc-turns-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={onHeaderKey}
        role="button"
        tabIndex={0}
        title="Collapse turns"
        aria-label="Collapse turns"
      >
        <span className="bc-turns-title">Turns</span>
        <span className="bc-turns-count">{items.length}</span>
        <span className="bc-spacer" />
        <span className="bc-turns-collapse-btn" aria-hidden="true">◂</span>
      </div>
      <div ref={containerRef} className="bc-turns-body">
        {items.length === 0 && <div className="bc-turns-empty">No messages yet</div>}
        {items.map(it => (
          <div key={it.key} className={`bc-turns-item bc-turns-${it.actor}${it.isError ? ' bc-turns-error' : ''}`} title={it.text}>
            <div className="bc-turns-meta">
              <span className="bc-turns-actor">{it.actor === 'user' ? 'You' : agent || 'assistant'}</span>
              <span className="bc-turns-ts">{formatHMS(it.ts)}</span>
              {it.usage && <UsageLine usage={it.usage} />}
            </div>
            <div className="bc-turns-text">{it.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!isAtBottom && (
        <button
          type="button"
          className="bc-jump-latest"
          onClick={() => scrollToBottom()}
          title="Jump to latest"
          aria-label="Jump to latest"
        >↓ New messages</button>
      )}
    </div>
  )
}

/* ── Timeline View ──
 *
 * Compact event-based stream: new turn, task-progress narrations, tool calls,
 * thinking, result/error. One line per event, grouped by turn. Built entirely
 * from logRows — no separate event feed.
 */
interface TimelineItem {
  key: string
  turnId?: string
  taskId?: string
  icon: string
  label: string
  detail?: string
  fullText?: string
  ts: string
  tone: 'turn' | 'thinking' | 'tool' | 'tool-done' | 'tool-err' | 'task' | 'task-start' | 'result' | 'error' | 'text'
}

function oneLine(s: string, n = 120): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > n ? flat.slice(0, n) + '…' : flat
}

function formatTodoWrite(todos: unknown): string | undefined {
  if (!Array.isArray(todos)) return undefined
  let done = 0
  let active = 0
  let pending = 0
  let current: string | undefined
  for (const raw of todos) {
    if (!raw || typeof raw !== 'object') continue
    const t = raw as { status?: string; content?: string; activeForm?: string }
    if (t.status === 'completed') done++
    else if (t.status === 'in_progress') { active++; current = t.activeForm || t.content || current }
    else pending++
  }
  const total = todos.length
  const bits: string[] = [`${total} todo${total === 1 ? '' : 's'}`]
  const counts: string[] = []
  if (done) counts.push(`${done}✓`)
  if (active) counts.push(`${active}⏺`)
  if (pending) counts.push(`${pending}○`)
  if (counts.length) bits.push(`(${counts.join(' ')})`)
  if (current) bits.push(`— ${oneLine(current, 60)}`)
  return bits.join(' ')
}

function toolSnippet(t: ToolEvent): string {
  if (!t.input) return ''
  const keys = Object.keys(t.input)
  if (keys.length === 0) return ''
  // Tool-specific formatters — fall through to the generic picker if nothing
  // applies. Keeps TodoWrite, which carries an array-of-objects payload, from
  // rendering as an empty-looking "todos".
  if (t.tool === 'TodoWrite') {
    const summary = formatTodoWrite(t.input.todos)
    if (summary) return summary
  }
  const preferred = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']
  for (const k of preferred) {
    const v = t.input[k]
    if (typeof v === 'string' && v) return `${k}=${oneLine(v, 80)}`
  }
  const first = t.input[keys[0]]
  if (typeof first === 'string') return `${keys[0]}=${oneLine(first, 80)}`
  if (Array.isArray(first)) return `${keys[0]}[${first.length}]`
  return keys.join(',')
}

function toolFullText(t: ToolEvent): string | undefined {
  if (!t.input) return undefined
  try { return JSON.stringify(t.input, null, 2) } catch { return undefined }
}

function rowsToTimeline(rows: LogRow[]): TimelineItem[] {
  const out: TimelineItem[] = []
  const seenTurn = new Set<string>()
  // Maps a live task scope id to its output-array index so task_started and
  // subsequent task_progress events collapse into a single timeline row.
  const taskIdxByScope = new Map<string, number>()
  let currentTurnId: string | undefined
  let currentTaskId: string | undefined

  for (const row of rows) {
    // Tasks are scoped to the turn they start in; a new turn closes any open
    // task block. task_started opens a new scope until the next task_started
    // or the end of the turn.
    if (row.turnId !== currentTurnId) {
      currentTurnId = row.turnId
      currentTaskId = undefined
      taskIdxByScope.clear()
    }

    if (row.kind === 'user_message') {
      currentTaskId = undefined
      const turnMark = row.turnId && !seenTurn.has(row.turnId)
      if (row.turnId) seenTurn.add(row.turnId)
      out.push({
        key: `tl_turn_${row.key}`,
        turnId: row.turnId,
        icon: turnMark ? '▶' : '»',
        label: 'Turn',
        detail: row.text ? oneLine(row.text) : undefined,
        fullText: row.text,
        ts: row.timestamp,
        tone: 'turn',
      })
      continue
    }

    if (row.kind === 'system' && row.subtype && row.subtype.startsWith('task_')) {
      // Historical claude_code events stored task_started with only the
      // subtype — task_id / description live on the raw harness payload.
      // Fall back to events[0].raw when systemFields didn't capture them.
      const raw = (row.events[0] as { raw?: Record<string, unknown> } | undefined)?.raw
      const explicitId = (row.systemFields?.task_id as string | undefined)
        || (typeof raw?.task_id === 'string' ? (raw.task_id as string) : undefined)
      const isStart = row.subtype === 'task_started'
      if (isStart) {
        // task_started in Claude Code carries no task_id — synthesize a stable
        // id so following items can nest under the block. task_progress events
        // do carry task_id, but we reuse the synthesized id so the grouping is
        // stable even when the real id arrives only mid-task.
        currentTaskId = explicitId || `task_${row.key}`
      } else if (explicitId && !currentTaskId) {
        // task_progress without a preceding task_started — open a scope from
        // the first progress event so subsequent items still nest.
        currentTaskId = explicitId
      }
      const description = (row.systemFields?.description as string | undefined)
        || (typeof raw?.description === 'string' ? (raw.description as string) : undefined)
      const lastTool = (row.systemFields?.last_tool_name as string | undefined)
        || (typeof raw?.last_tool_name === 'string' ? (raw.last_tool_name as string) : undefined)
      const taskType = typeof raw?.task_type === 'string' ? (raw.task_type as string) : undefined
      const full = description || row.systemMessage || lastTool || taskType || ''

      // Collapse task_started + task_progress (and any repeats) into a single
      // row per scope. task_started is the opener but carries no description;
      // the first task_progress fills in the description — just update the
      // existing row rather than emitting a second one.
      if (currentTaskId && taskIdxByScope.has(currentTaskId)) {
        const idx = taskIdxByScope.get(currentTaskId)!
        const existing = out[idx]
        if (!existing.detail && full) {
          existing.detail = oneLine(full)
          existing.fullText = full
        }
        continue
      }

      out.push({
        key: `tl_task_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '▣',
        label: 'Task',
        detail: full ? oneLine(full) : undefined,
        fullText: full || undefined,
        ts: row.timestamp,
        tone: 'task-start',
      })
      if (currentTaskId) taskIdxByScope.set(currentTaskId, out.length - 1)
      continue
    }

    if (row.kind === 'thinking' && row.thinking) {
      out.push({
        key: `tl_think_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '💭',
        label: 'Thinking',
        detail: oneLine(row.thinking),
        fullText: row.thinking,
        ts: row.timestamp,
        tone: 'thinking',
      })
      continue
    }

    if (row.kind === 'tool' && row.tools && row.tools.length > 0) {
      for (const t of row.tools) {
        const done = t.output !== undefined
        const err = !!t.error
        out.push({
          key: `tl_tool_${row.key}_${t.tool_id || t.tool}`,
          turnId: row.turnId,
          taskId: currentTaskId,
          icon: err ? '✗' : done ? '✓' : '⚙',
          label: t.tool || 'tool',
          detail: toolSnippet(t),
          fullText: toolFullText(t),
          ts: row.timestamp,
          tone: err ? 'tool-err' : done ? 'tool-done' : 'tool',
        })
      }
      continue
    }

    if (row.kind === 'result' && row.done) {
      currentTaskId = undefined
      const u = row.usage || row.meta?.usage
      let detail: string | undefined
      if (u) {
        const parts: string[] = []
        if (u.input_tokens) parts.push(`in ${formatTokens(u.input_tokens)}`)
        if (u.output_tokens) parts.push(`out ${formatTokens(u.output_tokens)}`)
        detail = parts.join(' · ') || undefined
      }
      out.push({
        key: `tl_res_${row.key}`,
        turnId: row.turnId,
        icon: '■',
        label: 'Done',
        detail,
        fullText: row.text || row.meta?.text,
        ts: row.timestamp,
        tone: 'result',
      })
      continue
    }

    if (row.kind === 'error' || row.errorMessage) {
      out.push({
        key: `tl_err_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '⚠',
        label: 'Error',
        detail: row.errorMessage ? oneLine(row.errorMessage) : undefined,
        fullText: row.errorMessage,
        ts: row.timestamp,
        tone: 'error',
      })
      continue
    }

    if (row.kind === 'text' && row.text) {
      out.push({
        key: `tl_text_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '✎',
        label: 'Text',
        detail: oneLine(row.text),
        fullText: row.text,
        ts: row.timestamp,
        tone: 'text',
      })
      continue
    }
  }
  return out
}

function TimelineItemRow({ item }: { item: TimelineItem }) {
  const tip = item.fullText || item.detail || item.label
  return (
    <div className={`bc-tl-item bc-tl-${item.tone}`} title={tip}>
      <span className="bc-tl-ts">{formatHMS(item.ts)}</span>
      <span className="bc-tl-icon">{item.icon}</span>
      <span className="bc-tl-label">{item.label}</span>
      {item.detail && <span className="bc-tl-detail">{item.detail}</span>}
    </div>
  )
}

// Render helpers: nest items inside per-turn groups, and per-task sub-groups
// within a turn, so the UI can paint left-aligned hierarchy bars.
function renderTurnChildren(items: TimelineItem[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (!it.taskId) {
      out.push(<TimelineItemRow key={it.key} item={it} />)
      i++
      continue
    }
    const taskId = it.taskId
    const start = i
    while (i < items.length && items[i].taskId === taskId) i++
    const [header, ...rest] = items.slice(start, i)
    out.push(
      <div key={`tk_${taskId}_${start}`} className="bc-tl-task-group">
        <div className="bc-tl-task-header">
          <TimelineItemRow key={header.key} item={header} />
        </div>
        {rest.length > 0 && (
          <div className="bc-tl-task-body">
            {rest.map(t => <TimelineItemRow key={t.key} item={t} />)}
          </div>
        )}
      </div>,
    )
  }
  return out
}

function renderTimelineNodes(items: TimelineItem[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (!it.turnId) {
      out.push(<TimelineItemRow key={it.key} item={it} />)
      i++
      continue
    }
    const turnId = it.turnId
    const start = i
    while (i < items.length && items[i].turnId === turnId) i++
    const [header, ...rest] = items.slice(start, i)
    out.push(
      <div key={`tg_${turnId}_${start}`} className="bc-tl-turn-group">
        <div className="bc-tl-turn-header">
          <TimelineItemRow key={header.key} item={header} />
        </div>
        {rest.length > 0 && (
          <div className="bc-tl-turn-body">
            {renderTurnChildren(rest)}
          </div>
        )}
      </div>,
    )
  }
  return out
}

function Timeline({ rows, onToggleCollapse, style, paneKey }: {
  rows: LogRow[]
  onToggleCollapse: () => void
  style?: React.CSSProperties
  paneKey?: string
}) {
  const { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom } = useStickyBottomScroll<HTMLDivElement>()
  const items = useMemo(() => rowsToTimeline(rows), [rows])
  useEffect(() => { autoScrollIfAtBottom() }, [items.length, autoScrollIfAtBottom])

  const onHeaderKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() }
  }, [onToggleCollapse])

  return (
    <div className="bc-timeline" style={style} data-pane={paneKey}>
      <div
        className="bc-timeline-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={onHeaderKey}
        role="button"
        tabIndex={0}
        title="Collapse timeline"
        aria-label="Collapse timeline"
      >
        <span className="bc-timeline-title">Timeline</span>
        <span className="bc-timeline-count">{items.length}</span>
        <span className="bc-spacer" />
        <span className="bc-timeline-collapse-btn" aria-hidden="true">▸</span>
      </div>
      <div ref={containerRef} className="bc-timeline-body">
        {items.length === 0 && <div className="bc-timeline-empty">No events yet</div>}
        {renderTimelineNodes(items)}
        <div ref={endRef} />
      </div>
      {!isAtBottom && (
        <button
          type="button"
          className="bc-jump-latest"
          onClick={() => scrollToBottom()}
          title="Jump to latest"
          aria-label="Jump to latest"
        >↓ New events</button>
      )}
    </div>
  )
}

/* ── Inline Thread ── */
function Thread({ rows, loading, uiState, activity, error, agent, sessionId }: {
  rows: LogRow[]
  loading: boolean
  uiState: string
  activity: { kind: string; name?: string }
  error: string | null
  agent: string
  sessionId: string
}) {
  const { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom } = useStickyBottomScroll<HTMLDivElement>()
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenTypes())

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) for (const t of typesInRow(r)) set.add(t)
    return [...set].sort()
  }, [rows])

  const visibleRows = useMemo(() => {
    if (hidden.size === 0) return rows
    return rows.filter(r => typesInRow(r).some(t => !hidden.has(t)))
  }, [rows, hidden])

  const blocks = useMemo(() => groupRowsByTurn(visibleRows), [visibleRows])

  useEffect(() => { autoScrollIfAtBottom() }, [visibleRows, autoScrollIfAtBottom])

  const toggleType = useCallback((t: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      saveHiddenTypes(next)
      return next
    })
  }, [])

  if (loading) return <div className="bc-thread"><div className="bc-loading">Loading history...</div></div>
  if (rows.length === 0 && !error) return <div className="bc-thread"><div className="bc-empty">Send a message to start</div></div>

  return (
    <ToolContext.Provider value={{ sessionId }}>
    <div className="bc-thread-wrap">
      <div ref={containerRef} className="bc-thread">
        <FilterBar types={allTypes} hidden={hidden} onToggle={toggleType} />
        {error && <div className="bridge-error">{error}</div>}
        {blocks.map((b, i) => b.kind === 'turn'
          ? <TurnGroupView key={`turn_${b.turnId}`} turnId={b.turnId} rows={b.rows} agent={agent} />
          : <LogRowView key={`row_${b.row.key}_${i}`} row={b.row} agent={agent} />
        )}
        {uiState === 'running' && (
          <div className="bc-activity">
            <span className="bc-activity-dot" />
            {activity.kind === 'tool' ? `Running: ${activity.name}` : activity.kind === 'thinking' ? 'Thinking...' : 'Streaming...'}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!isAtBottom && (
        <button
          type="button"
          className="bc-jump-latest"
          onClick={() => scrollToBottom()}
          title="Jump to latest"
          aria-label="Jump to latest"
        >↓ New messages</button>
      )}
    </div>
    </ToolContext.Provider>
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
function SessionHeader({ chat, uiState, activity, rows, instance, onRename, onPrev, onNext, hasPrev, hasNext }: {
  chat: ChatSession | null
  uiState: string
  activity: { kind: string; name?: string }
  rows: LogRow[]
  instance: { name: string; transport: string } | null
  onRename: (name: string) => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
}) {
  if (!chat || uiState === 'empty') return null

  const completed = rows.filter(r => r.actor === 'assistant' && r.done && r.meta)
  const last = completed[completed.length - 1]
  const meta = last?.meta
  let totalCost = 0
  for (const r of completed) totalCost += r.meta?.cost?.total_usd ?? 0

  const contextTokens = meta?.usage?.context_tokens ?? 0
  const contextLimit = meta?.usage?.context_limit ?? 0
  const contextPct = contextTokens && contextLimit ? Math.round((contextTokens / contextLimit) * 100) : 0

  return (
    <div className="bc-header">
      <div className="bc-header-row">
        <div className="bc-nav-arrows">
          <button className="bc-nav-arrow" onClick={onPrev} disabled={!hasPrev} title="Previous session" aria-label="Previous session">‹</button>
          <button className="bc-nav-arrow" onClick={onNext} disabled={!hasNext} title="Next session" aria-label="Next session">›</button>
        </div>
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
      {contextTokens > 0 && contextLimit > 0 && (
        <div className="bc-context-row">
          <span className="bc-context-label">{formatTokens(contextTokens)} / {formatTokens(contextLimit)} ({contextPct}%)</span>
          <div className="bc-context-bar">
            <div className={`bc-bar-fill ${contextPct >= 90 ? 'bc-bar-crit' : contextPct >= 70 ? 'bc-bar-warn' : ''}`} style={{ width: `${Math.min(100, contextPct)}%` }} />
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
function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath, onToggleCollapse }: {
  instances: Array<{ id: string; name: string; harness_type: string; host: string; transport: string; enabled: boolean }>
  harnesses: HarnessInfo[]
  sessions: Array<{ instance_id?: string; state: string }>
  selectedInstance: string
  onSelect: (id: string) => void
  onNewInstance: () => void
  basePath: string
  instancesPath: string
  onToggleCollapse: () => void
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
        <button className="htb-collapse-btn" onClick={onToggleCollapse} title="Collapse harness bar" aria-label="Collapse harness bar">▴</button>
        <div className="htb-empty">No harness instances configured. <Link to={instancesPath}>Add an instance</Link> to get started.</div>
        <button className="htb-new-instance" onClick={onNewInstance} title="Add new instance">+</button>
      </div>
    )
  }

  return (
    <div className="htb-wrapper">
      <button className="htb-collapse-btn" onClick={onToggleCollapse} title="Collapse harness bar" aria-label="Collapse harness bar">▴</button>
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

function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
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
    setCollapseState(s => {
      const next = ensureOneChatPaneOpen({ ...s, turns: !s.turns })
      saveCollapseState(next)
      return next
    })
  }, [])
  const toggleThread = useCallback(() => {
    setCollapseState(s => {
      const next = ensureOneChatPaneOpen({ ...s, thread: !s.thread })
      saveCollapseState(next)
      return next
    })
  }, [])
  const toggleTimeline = useCallback(() => {
    setCollapseState(s => {
      const next = ensureOneChatPaneOpen({ ...s, timeline: !s.timeline })
      saveCollapseState(next)
      return next
    })
  }, [])
  const toggleGit = useCallback(() => {
    setCollapseState(s => {
      const next = ensureOneChatPaneOpen({ ...s, git: !s.git })
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
          />
          <div
            ref={splitRef}
            className={`bc-chat-split${collapseState.turns ? ' bc-split-turns-collapsed' : ''}${collapseState.thread ? ' bc-split-thread-collapsed' : ''}${collapseState.timeline ? ' bc-split-timeline-collapsed' : ''}${collapseState.git ? ' bc-split-git-collapsed' : ''}`}
          >
            {collapseState.turns ? (
              <button
                className="bc-split-strip bc-split-strip-turns"
                onClick={toggleTurns}
                title="Show turns"
                aria-label="Show turns"
              >
                <span className="bc-split-strip-chevron">▸</span>
                <span className="bc-split-strip-label">Turns</span>
              </button>
            ) : (
              <TurnsView
                rows={bridge.logRows}
                agent={activeChat?.agent ?? ''}
                onToggleCollapse={toggleTurns}
                style={{ flex: `${paneSizes.turns} 1 0` }}
                paneKey="turns"
              />
            )}
            {!collapseState.turns && !collapseState.thread && (
              <SplitResizer leftKey="turns" rightKey="thread" containerRef={splitRef} setSizes={setPaneSizes} />
            )}
            {collapseState.thread ? (
              <button
                className="bc-split-strip bc-split-strip-thread"
                onClick={toggleThread}
                title="Show thread"
                aria-label="Show thread"
              >
                <span className="bc-split-strip-chevron">▸</span>
                <span className="bc-split-strip-label">Thread</span>
              </button>
            ) : (
              <div
                className="bc-split-pane bc-split-pane-thread"
                style={{ flex: `${paneSizes.thread} 1 0` }}
                data-pane="thread"
              >
                <div
                  className="bc-split-pane-header bc-header-clickable"
                  onClick={toggleThread}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleThread() } }}
                  role="button"
                  tabIndex={0}
                  title="Collapse thread"
                  aria-label="Collapse thread"
                >
                  <span className="bc-split-pane-title">Thread</span>
                  <span className="bc-spacer" />
                  <span className="bc-split-collapse-btn" aria-hidden="true">◂</span>
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
            )}
            {!collapseState.thread && !collapseState.timeline && (
              <SplitResizer leftKey="thread" rightKey="timeline" containerRef={splitRef} setSizes={setPaneSizes} />
            )}
            {collapseState.timeline ? (
              <button
                className="bc-split-strip bc-split-strip-timeline"
                onClick={toggleTimeline}
                title="Show timeline"
                aria-label="Show timeline"
              >
                <span className="bc-split-strip-chevron">◂</span>
                <span className="bc-split-strip-label">Timeline</span>
              </button>
            ) : (
              <Timeline
                rows={bridge.logRows}
                onToggleCollapse={toggleTimeline}
                style={{ flex: `${paneSizes.timeline} 1 0` }}
                paneKey="timeline"
              />
            )}
            {!collapseState.timeline && !collapseState.git && (
              <SplitResizer leftKey="timeline" rightKey="git" containerRef={splitRef} setSizes={setPaneSizes} />
            )}
            {collapseState.git ? (
              <button
                className="bc-split-strip bc-split-strip-git"
                onClick={toggleGit}
                title="Show git"
                aria-label="Show git"
              >
                <span className="bc-split-strip-chevron">◂</span>
                <span className="bc-split-strip-label">Git</span>
              </button>
            ) : (
              <GitPanel
                sessionId={activeChat?.sessionId ?? ''}
                uiState={bridge.uiState}
                onToggleCollapse={toggleGit}
                style={{ flex: `${paneSizes.git} 1 0` }}
                paneKey="git"
              />
            )}
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
