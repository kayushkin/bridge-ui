import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../../../context'
import { formatCost, timeAgo } from '../../../utils'
import { idTail } from '../utils'
import { SessionSignals } from '../SessionSignals'
import type { ResolvedRefMatch } from '@kayushkin/chat-core'
import type { RefKind } from './remarkRefChips'
import {
  fetchSessionCore, fetchSessionCost, fetchNoteboardItemRef, fetchResolvedRef,
  sessionEmoji, type SessionCore, type NoteboardItemRef,
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
  if (kind === 'session') return <SessionChip refId={refId} />
  // A bare uuid with no cue word: the host's reference resolver classifies it,
  // and the chip re-renders as whatever the id turns out to name.
  if (kind === 'uuid') return <UuidChip refId={refId} />
  // note / todo cue kinds — one noteboard id space either way.
  return <NoteboardItemChip refId={refId} />
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

export function NoteboardItemChip({ refId }: { refId: string }) {
  const cfg = useBridgeConfig()
  const { open, setOpen, wrapRef } = useDropdown()
  const configured = !!cfg.noteboardBasePath
  const { data: item, error } = useRefLoad<NoteboardItemRef>(() =>
    configured ? fetchNoteboardItemRef(cfg.fetch, cfg.noteboardBasePath, refId) : Promise.reject(new Error('noteboard not configured')))

  // The item's own `type` labels the chip — the cue word or resolver match
  // that led here only said which store to ask.
  const itemKind = item?.type || 'item'
  const label = item && item.title ? truncate(item.title) : idTail(refId, 12)
  const emoji = item ? noteboardItemEmoji(item) : '☑'

  return (
    <span className="bc-ref-wrap" ref={wrapRef}>
      {/* Noteboard items have no chat to open, so the whole chip toggles the dropdown. */}
      <button
        type="button"
        className={`bc-ref bc-ref-todo${open ? ' bc-ref-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={`${itemKind} — ${item?.title || refId}`}
      >
        <span className="bc-ref-glyph" aria-hidden>{emoji}</span>
        <span className="bc-ref-label">{label}</span>
        <span className="bc-ref-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="bc-ref-panel" role="dialog" aria-label="Noteboard item details">
          {!configured && <div className="bc-ref-panel-loading">Noteboard lookup isn’t configured here.</div>}
          {configured && !item && !error && <div className="bc-ref-panel-loading">Loading…</div>}
          {error && configured && <div className="bc-ref-panel-error">Couldn’t load item: {error}</div>}
          {item && (
            <>
              <div className="bc-ref-panel-title">{item.title || '(untitled)'}</div>
              {item.type && <RefRow label="Type" value={item.type} />}
              <RefRow label="Status" value={item.status} badge={item.held_at ? 'held' : (item.deleted_at ? 'deleted' : undefined)} />
              {item.priority !== 0 && <RefRow label="Priority" value={String(item.priority)} />}
              {item.tags.length > 0 && <RefRow label="Tags" value={item.tags.join(', ')} />}
              {item.due_at && <RefRow label="Due" value={timeAgo(item.due_at)} />}
              {item.updated_at && <RefRow label="Updated" value={timeAgo(item.updated_at)} />}
              {/* Somewhere to GO. A session reference has always been a link —
                  SessionChip is a `<Link>` to the chat — while a todo reference
                  could only be inspected, because there was nowhere to send it.
                  There is now: a todo id IS a kanban card id, and the board
                  resolves `?card=` across boards, so a todo can be opened on the
                  board that holds it from anywhere it is mentioned.

                  In the PANEL rather than on the chip itself, which is the one
                  thing this could not copy from SessionChip. That chip is a link
                  and has no panel; this one's click already opens these details,
                  and making the chip navigate would take them away to add a
                  destination. */}
              {cfg.routes.kanban && (
                <Link
                  className="bc-ref-panel-link"
                  to={`${cfg.routes.kanban}?card=${encodeURIComponent(refId)}`}
                >Open on the board ↗</Link>
              )}
            </>
          )}
        </div>
      )}
    </span>
  )
}

/**
 * A bare uuid detected with no cue word. The text says nothing about what it
 * names, so the host's reference resolver (`cfg.resolveEndpoint`, dash's
 * `POST /api/resolve`) is asked, and the chip re-renders as whichever kind the
 * id turns out to be: a session chip, a noteboard chip, or — for several
 * matches or a type with no dedicated chip — a generic chip whose panel lists
 * every match, because silently picking one would present a guess as a fact.
 * No resolver, no match, or a resolver error all render the id as plain text,
 * exactly what the message showed before detection existed (an error carries a
 * tooltip so the failure is discoverable without being noisy).
 */
function UuidChip({ refId }: { refId: string }) {
  const cfg = useBridgeConfig()
  const configured = !!cfg.resolveEndpoint
  const { data: matches, error } = useRefLoad<ResolvedRefMatch[]>(() =>
    configured ? fetchResolvedRef(cfg.fetch, cfg.resolveEndpoint, refId) : Promise.reject(new Error('reference resolver not configured')))

  if (!matches || matches.length === 0) {
    return <span data-ref-kind="uuid" data-ref-id={refId} title={error ?? undefined}>{refId}</span>
  }
  if (matches.length === 1) {
    const match = matches[0]
    if (match.type === 'session') return <SessionChip refId={refId} />
    if (match.type === 'note') return <NoteboardItemChip refId={refId} />
  }
  return <MultiMatchChip refId={refId} matches={matches} />
}

/** The honest rendering for an id that resolved ambiguously or to a type this
 *  renderer has no dedicated chip for: the panel lists every match and the
 *  reader does the picking. */
function MultiMatchChip({ refId, matches }: { refId: string; matches: ResolvedRefMatch[] }) {
  const { open, setOpen, wrapRef } = useDropdown()
  const label = matches.length === 1 ? `${matches[0].type} ${idTail(refId, 12)}` : idTail(refId, 12)

  return (
    <span className="bc-ref-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`bc-ref bc-ref-todo${open ? ' bc-ref-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={refId}
      >
        <span className="bc-ref-glyph" aria-hidden>🔗</span>
        <span className="bc-ref-label">{label}</span>
        <span className="bc-ref-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="bc-ref-panel" role="dialog" aria-label="Reference details">
          <div className="bc-ref-panel-title">{refId}</div>
          {matches.length > 1 && (
            <div className="bc-ref-panel-loading">This id resolves in {matches.length} stores:</div>
          )}
          {matches.map(m => (
            <RefRow key={`${m.service}/${m.type}`} label={m.type} value={m.service} />
          ))}
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

// Held and deleted outrank the item's type — a parked or deleted item is not
// work anyone should pick up, and that is what a reader most needs to know
// about a quoted id. Matches chat-core's itemEmoji.
function noteboardItemEmoji(item: NoteboardItemRef): string {
  if (item.deleted_at) return '🗑'
  if (item.held_at) return '⏸'
  if (item.status === 'done') return '✅'
  if (item.type === 'note') return '📝'
  if (item.type === 'workspace') return '🧠'
  if (item.type === 'rank') return '🔢'
  return '☑'
}
