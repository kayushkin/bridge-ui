import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../../../context'
import { formatCost, timeAgo } from '../../../utils'
import { idTail } from '../utils'
import { SessionSignals } from '../SessionSignals'
import type { RefKind } from './remarkRefChips'
import {
  fetchSessionCore, fetchSessionCost, fetchTodoRef,
  sessionEmoji, type SessionCore, type TodoRef,
} from './refData'

// react-markdown hands custom-element components the hast node. hProperties set
// by remarkRefChips arrive verbatim on `node.properties`, so kind/refId are read
// from there rather than from loosely-typed spread props.
interface RefChipNodeProps {
  node?: { properties?: Record<string, unknown> }
}

function readNodeProp(props: RefChipNodeProps, key: string): string | undefined {
  const v = props.node?.properties?.[key]
  return typeof v === 'string' ? v : undefined
}

function truncate(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function RefChip(props: RefChipNodeProps) {
  const kind = readNodeProp(props, 'kind') as RefKind | undefined
  const refId = readNodeProp(props, 'refId')

  // A malformed node with no id can't resolve to anything; render the raw text
  // rather than an empty chip so nothing is silently dropped.
  if (!kind || !refId) return <>{refId ?? ''}</>
  return kind === 'session'
    ? <SessionChip refId={refId} />
    : <TodoChip refId={refId} />
}

// Lazy/eager load state machine shared by both chips: idle → loading → loaded.
function useRefLoad<T>(loader: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loader().then(
      d => { if (live) setData(d) },
      (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)) },
    )
    return () => { live = false }
    // loader closes over the stable refId; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { data, error }
}

// Shared dropdown open/close behaviour: click-outside + Escape, anchored to a
// wrapper ref. Returns the ref to attach and the open state + toggler.
function useDropdown() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, wrapRef }
}

function SessionChip({ refId }: { refId: string }) {
  const cfg = useBridgeConfig()
  const { open, setOpen, wrapRef } = useDropdown()
  const { data: core, error } = useRefLoad<SessionCore>(() => fetchSessionCore(cfg.fetch, cfg.basePath, refId))

  const emoji = core ? sessionEmoji(core.type, core.purpose, refId) : '💬'
  const label = core && core.display_name ? truncate(core.display_name) : idTail(refId, 12)
  const chatHref = `${cfg.routes.chat}?session=${encodeURIComponent(refId)}`

  return (
    <span className="bc-ref-wrap" ref={wrapRef}>
      {/* Main chip navigates to the referenced session's chat. */}
      <Link className="bc-ref bc-ref-session" to={chatHref} title={`Open chat — ${core?.display_name || refId}`}>
        <span className="bc-ref-glyph" aria-hidden>{emoji}</span>
        <span className="bc-ref-label">{label}</span>
      </Link>
      {/* Caret opens the detail dropdown to the side without navigating. */}
      <button
        type="button"
        className={`bc-ref-caret-btn${open ? ' bc-ref-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Session details"
        title="Details"
      >▾</button>
      {open && <SessionRefPanel core={core} error={error} refId={refId} />}
    </span>
  )
}

function SessionRefPanel({ core, error, refId }: { core: SessionCore | null; error: string | null; refId: string }) {
  const cfg = useBridgeConfig()
  // Cost is the one heavy join (whole aggregates array) — fetch it only now,
  // when the panel is actually open, keyed off the already-loaded core.
  const [cost, setCost] = useState<number | null>(null)
  useEffect(() => {
    if (!core) return
    let live = true
    fetchSessionCost(cfg.fetch, cfg.basePath, core.session_id || refId, core.harness_session_id)
      .then(c => { if (live) setCost(c) })
    return () => { live = false }
  }, [core, cfg, refId])

  return (
    <div className="bc-ref-panel" role="dialog" aria-label="Session details">
      {!core && !error && <div className="bc-ref-panel-loading">Loading session…</div>}
      {error && <div className="bc-ref-panel-error">Couldn’t load session: {error}</div>}
      {core && (
        <>
          <div className="bc-ref-panel-title">{core.display_name || '(untitled session)'}</div>
          <RefRow label="State" value={core.state} badge={stateBadge(core.state)} />
          {core.type && <RefRow label="Type" value={core.purpose ? `${core.type} · ${core.purpose}` : core.type} />}
          {core.model && <RefRow label="Model" value={core.model} />}
          {core.harness && <RefRow label="Harness" value={core.harness} />}
          {cost != null && cost > 0 && <RefRow label="Cost" value={formatCost(cost)} />}
          {core.updated_at && <RefRow label="Updated" value={timeAgo(core.updated_at)} />}
          {/* The cross-session answer: open session A's chip while working in
              session B and answer A's question here. The State row's
              "question" badge says a signal is waiting; this is where it can
              be dealt with. */}
          <SessionSignals sessionId={core.session_id || refId} compact />
        </>
      )}
    </div>
  )
}

function TodoChip({ refId }: { refId: string }) {
  const cfg = useBridgeConfig()
  const { open, setOpen, wrapRef } = useDropdown()
  const configured = !!cfg.noteboardBasePath
  const { data: todo, error } = useRefLoad<TodoRef>(() =>
    configured ? fetchTodoRef(cfg.fetch, cfg.noteboardBasePath, refId) : Promise.reject(new Error('noteboard not configured')))

  const label = todo && todo.title ? truncate(todo.title) : idTail(refId, 12)
  const emoji = todo ? todoEmoji(todo) : '☑'

  return (
    <span className="bc-ref-wrap" ref={wrapRef}>
      {/* Todos have no chat to open, so the whole chip toggles the dropdown. */}
      <button
        type="button"
        className={`bc-ref bc-ref-todo${open ? ' bc-ref-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={`Todo — ${todo?.title || refId}`}
      >
        <span className="bc-ref-glyph" aria-hidden>{emoji}</span>
        <span className="bc-ref-label">{label}</span>
        <span className="bc-ref-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="bc-ref-panel" role="dialog" aria-label="Todo details">
          {!configured && <div className="bc-ref-panel-loading">Todo lookup isn’t configured here.</div>}
          {configured && !todo && !error && <div className="bc-ref-panel-loading">Loading todo…</div>}
          {error && configured && <div className="bc-ref-panel-error">Couldn’t load todo: {error}</div>}
          {todo && (
            <>
              <div className="bc-ref-panel-title">{todo.title || '(untitled todo)'}</div>
              <RefRow label="Status" value={todo.status} badge={todo.held_at ? 'held' : (todo.deleted_at ? 'deleted' : undefined)} />
              {todo.priority !== 0 && <RefRow label="Priority" value={String(todo.priority)} />}
              {todo.tags.length > 0 && <RefRow label="Tags" value={todo.tags.join(', ')} />}
              {todo.due_at && <RefRow label="Due" value={timeAgo(todo.due_at)} />}
              {todo.updated_at && <RefRow label="Updated" value={timeAgo(todo.updated_at)} />}
            </>
          )}
        </div>
      )}
    </span>
  )
}

function RefRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="bc-ref-panel-row">
      <span className="bc-ref-panel-label">{label}</span>
      <span className="bc-ref-panel-value">
        {value}
        {badge && <span className={`bc-ref-badge bc-ref-badge-${badge}`}>{badge}</span>}
      </span>
    </div>
  )
}

// The "needs you" states get a badge so a question or a blocked approval stands
// out in the chip panel.
function stateBadge(state: string): string | undefined {
  if (state === 'awaiting_user') return 'question'
  if (state === 'awaiting_permission') return 'approval'
  return undefined
}

function todoEmoji(todo: TodoRef): string {
  if (todo.deleted_at) return '🗑'
  if (todo.held_at) return '⏸'
  if (todo.status === 'done') return '✅'
  return '☑'
}
