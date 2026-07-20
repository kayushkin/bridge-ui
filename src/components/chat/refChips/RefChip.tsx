import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../../../context'
import { formatCost, timeAgo } from '../../../utils'
import { idTail } from '../utils'
import type { RefKind } from './remarkRefChips'
import { fetchSessionRef, fetchTodoRef, type SessionRef, type TodoRef } from './refData'

// react-markdown hands custom-element components the hast node. hProperties set
// by remarkRefChips arrive verbatim on `node.properties`, so kind/refId are
// read from there rather than from loosely-typed spread props.
interface RefChipNodeProps {
  node?: { properties?: Record<string, unknown> }
}

function readNodeProp(props: RefChipNodeProps, key: string): string | undefined {
  const v = props.node?.properties?.[key]
  return typeof v === 'string' ? v : undefined
}

export function RefChip(props: RefChipNodeProps) {
  const kind = readNodeProp(props, 'kind') as RefKind | undefined
  const refId = readNodeProp(props, 'refId')

  // A malformed node with no id can't resolve to anything; render the raw text
  // rather than an empty chip so nothing is silently dropped.
  if (!kind || !refId) return <>{refId ?? ''}</>
  return <RefChipInner kind={kind} refId={refId} />
}

function RefChipInner({ kind, refId }: { kind: RefKind; refId: string }) {
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

  return (
    <span className="bc-ref-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`bc-ref bc-ref-${kind}${open ? ' bc-ref-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={`${kind === 'session' ? 'Session' : 'Todo'} ${refId} · click for details`}
      >
        <span className="bc-ref-glyph" aria-hidden>{kind === 'session' ? '⧉' : '☑'}</span>
        <span className="bc-ref-id">{idTail(refId, 12)}</span>
        <span className="bc-ref-caret" aria-hidden>▾</span>
      </button>
      {open && (kind === 'session'
        ? <SessionRefPanel refId={refId} />
        : <TodoRefPanel refId={refId} />)}
    </span>
  )
}

// Small state machine shared by both panels: idle → loading → loaded | error.
// Fetch is lazy — it fires on first open only.
function useRefLoad<T>(loader: () => Promise<T>): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    loader().then(
      d => { if (live) { setData(d); setLoading(false) } },
      (e: unknown) => { if (live) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } },
    )
    return () => { live = false }
    // loader identity is stable per-open (panel mounts on open); refId is the
    // real dependency and it's baked into loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { data, error, loading }
}

function SessionRefPanel({ refId }: { refId: string }) {
  const cfg = useBridgeConfig()
  const { data, error, loading } = useRefLoad<SessionRef>(() => fetchSessionRef(cfg.fetch, cfg.basePath, refId))

  return (
    <div className="bc-ref-panel" role="dialog" aria-label="Session details">
      {loading && <div className="bc-ref-panel-loading">Loading session…</div>}
      {error && <div className="bc-ref-panel-error">Couldn’t load session: {error}</div>}
      {data && (
        <>
          <div className="bc-ref-panel-title">{data.display_name || '(untitled session)'}</div>
          <RefRow label="State" value={data.state} badge={stateBadge(data.state)} />
          {data.type && <RefRow label="Type" value={data.type} />}
          {data.model && <RefRow label="Model" value={data.model} />}
          {data.harness && <RefRow label="Harness" value={data.harness} />}
          {data.cost_usd != null && data.cost_usd > 0 && (
            <RefRow label="Cost" value={formatCost(data.cost_usd)} />
          )}
          {data.updated_at && <RefRow label="Updated" value={timeAgo(data.updated_at)} />}
          <div className="bc-ref-panel-actions">
            <Link className="bc-ref-panel-link" to={`${cfg.routes.chat}?session=${encodeURIComponent(refId)}`}>
              Open chat →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function TodoRefPanel({ refId }: { refId: string }) {
  const cfg = useBridgeConfig()
  const { data, error, loading } = useRefLoad<TodoRef>(() => fetchTodoRef(cfg.fetch, cfg.noteboardBasePath, refId))

  if (!cfg.noteboardBasePath) {
    return (
      <div className="bc-ref-panel" role="dialog" aria-label="Todo details">
        <div className="bc-ref-panel-loading">Todo lookup isn’t configured here.</div>
      </div>
    )
  }
  return (
    <div className="bc-ref-panel" role="dialog" aria-label="Todo details">
      {loading && <div className="bc-ref-panel-loading">Loading todo…</div>}
      {error && <div className="bc-ref-panel-error">Couldn’t load todo: {error}</div>}
      {data && (
        <>
          <div className="bc-ref-panel-title">{data.title || '(untitled todo)'}</div>
          <RefRow label="Status" value={data.status} badge={data.held_at ? 'held' : (data.deleted_at ? 'deleted' : undefined)} />
          {data.priority != null && data.priority !== 0 && <RefRow label="Priority" value={String(data.priority)} />}
          {data.tags && data.tags.length > 0 && <RefRow label="Tags" value={data.tags.join(', ')} />}
          {data.due_at && <RefRow label="Due" value={timeAgo(data.due_at)} />}
          {data.updated_at && <RefRow label="Updated" value={timeAgo(data.updated_at)} />}
        </>
      )}
    </div>
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

// A tiny presentation map: the "needs you" states get a badge so a question or
// a blocked approval stands out in the chip panel.
function stateBadge(state: string): string | undefined {
  if (state === 'awaiting_user') return 'question'
  if (state === 'awaiting_permission') return 'approval'
  return undefined
}
