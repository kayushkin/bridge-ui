import type { FetchFn } from '../../../types'
import type { ResolvedRefMatch, ResolveResponse } from '@kayushkin/chat-core'

// The core session fields the chip needs eagerly — for the label (name +
// type/purpose emoji) and the dropdown's primary rows. Sourced from
// GET /sessions/{id}. Cost is NOT here: it lives in a heavy unfiltered
// aggregates array and is fetched lazily only when the dropdown opens.
export interface SessionCore {
  session_id: string
  harness_session_id: string
  display_name: string
  state: string
  type: string
  purpose: string
  harness: string
  model: string
  updated_at: string
}

// The fields the noteboard chip shows — for any item type in noteboard's one
// id space (note, todo, rank, workspace). Fetched eagerly too, so the chip can
// label itself with the item's title. `type` comes from the item itself, which
// is the authority — the cue word or resolver match that led here is only what
// made the lookup happen.
export interface NoteboardItemRef {
  type: string
  title: string
  status: string
  priority: number
  tags: string[]
  due_at: string
  updated_at: string
  held_at: string | null
  deleted_at: string | null
}

async function getJSON(fetchFn: FetchFn, url: string): Promise<unknown> {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  return typeof v === 'string' ? v : ''
}

// Eager fetches (session core + todo) run once per chip on mount. A chat with
// the same id repeated many times would otherwise refetch per chip, so results
// are cached by id for a short window and shared across chips.
const CORE_TTL_MS = 30_000
const sessionCoreCache = new Map<string, { at: number; p: Promise<SessionCore> }>()
const noteboardItemCache = new Map<string, { at: number; p: Promise<NoteboardItemRef> }>()

function cached<T>(cache: Map<string, { at: number; p: Promise<T> }>, key: string, make: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < CORE_TTL_MS) return hit.p
  const p = make()
  cache.set(key, { at: now, p })
  // A rejected fetch must not be cached as a permanent failure.
  p.catch(() => { if (cache.get(key)?.p === p) cache.delete(key) })
  return p
}

export function fetchSessionCore(fetchFn: FetchFn, basePath: string, sessionId: string): Promise<SessionCore> {
  return cached(sessionCoreCache, sessionId, async () => {
    const raw = await getJSON(fetchFn, `${basePath}/sessions/${encodeURIComponent(sessionId)}`)
    const o = (raw ?? {}) as Record<string, unknown>
    const info = (o.info ?? {}) as Record<string, unknown>
    return {
      session_id: str(o, 'session_id'),
      harness_session_id: str(o, 'harness_session_id'),
      display_name: str(o, 'display_name'),
      state: str(o, 'state'),
      type: str(o, 'type'),
      purpose: str(o, 'purpose'),
      harness: str(o, 'harness'),
      model: str(info, 'model'),
      updated_at: str(o, 'updated_at'),
    }
  })
}

export function fetchNoteboardItemRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<NoteboardItemRef> {
  return cached(noteboardItemCache, itemId, async () => {
    const raw = await getJSON(fetchFn, `${noteboardBasePath}/api/items/${encodeURIComponent(itemId)}`)
    const o = (raw ?? {}) as Record<string, unknown>
    const tags = Array.isArray(o.tags) ? (o.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []
    return {
      type: str(o, 'type'),
      title: str(o, 'title'),
      status: str(o, 'status'),
      priority: typeof o.priority === 'number' ? o.priority : 0,
      tags,
      due_at: str(o, 'due_at'),
      updated_at: str(o, 'updated_at'),
      held_at: typeof o.held_at === 'string' ? o.held_at : null,
      deleted_at: typeof o.deleted_at === 'string' ? o.deleted_at : null,
    }
  })
}

// There is no per-session cost route: GET /sessions/aggregates returns the
// whole unfiltered array (thousands of rows), and a session's spend is keyed by
// EITHER its bridge session_id OR its harness_session_id. Fetched once and
// cached briefly, and only when a dropdown opens — never eagerly. Cost is
// supplementary; a failure here returns null rather than erroring the panel.
interface AggRow { session_id: string; cost_usd: number }
let aggCache: { at: number; rows: AggRow[] } | null = null
const AGG_TTL_MS = 30_000

async function loadAggregates(fetchFn: FetchFn, basePath: string): Promise<AggRow[]> {
  const now = Date.now()
  if (aggCache && now - aggCache.at < AGG_TTL_MS) return aggCache.rows
  const raw = await getJSON(fetchFn, `${basePath}/sessions/aggregates`)
  const rows = Array.isArray(raw)
    ? (raw as Record<string, unknown>[]).map(r => ({
        session_id: str(r, 'session_id'),
        cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : 0,
      }))
    : []
  aggCache = { at: now, rows }
  return rows
}

export async function fetchSessionCost(fetchFn: FetchFn, basePath: string, sessionId: string, harnessSessionId: string): Promise<number | null> {
  try {
    const rows = await loadAggregates(fetchFn, basePath)
    const hit = rows.find(r => r.session_id === sessionId || (harnessSessionId !== '' && r.session_id === harnessSessionId))
    return hit ? hit.cost_usd : null
  } catch {
    return null
  }
}

// --- batched reference resolution ---
//
// A bare uuid carries no store hint, so the host's resolver (dash's
// `POST /api/resolve`) classifies it against the entity-type registry. One
// transcript can mount dozens of uuid chips in a render pass; ids queue for a
// short flush window and go out as one batch, and results cache like the
// eager fetches above. Wire types come from `@kayushkin/chat-core`, which owns
// the resolver contract for every chat surface.

const RESOLVE_FLUSH_MS = 25
const RESOLVE_BATCH_MAX = 128 // dash's per-call cap

const resolvedRefCache = new Map<string, { at: number; p: Promise<ResolvedRefMatch[]> }>()

interface ResolveWaiter {
  resolve: (m: ResolvedRefMatch[]) => void
  reject: (e: unknown) => void
}

// Keyed by endpoint so two providers on one page never cross wires. The fetch
// function used for a flush is the one the first enqueuer supplied; every
// consumer of one endpoint shares one auth'd fetch in practice.
const resolveQueues = new Map<string, { fetchFn: FetchFn; pending: Map<string, ResolveWaiter[]>; timer: ReturnType<typeof setTimeout> | null }>()

async function flushResolveQueue(endpoint: string): Promise<void> {
  const queue = resolveQueues.get(endpoint)
  if (!queue) return
  queue.timer = null
  const taken = queue.pending
  queue.pending = new Map()
  const ids = [...taken.keys()]
  for (let start = 0; start < ids.length; start += RESOLVE_BATCH_MAX) {
    const batch = ids.slice(start, start + RESOLVE_BATCH_MAX)
    try {
      const res = await queue.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const response = (await res.json()) as ResolveResponse
      const errorsByID = new Map((response.errors ?? []).map(e => [e.id, e.error]))
      for (const id of batch) {
        const idError = errorsByID.get(id)
        const matches = response.results[id]
        for (const waiter of taken.get(id) ?? []) {
          // A per-id error means the misses are not definitive — reject so the
          // cache evicts and the next mount retries, rather than caching a
          // store outage as "this id names nothing".
          if (idError !== undefined) waiter.reject(new Error(idError))
          else if (matches === undefined) waiter.reject(new Error('resolver response is missing this id'))
          else waiter.resolve(matches)
        }
      }
    } catch (e) {
      for (const id of batch) {
        for (const waiter of taken.get(id) ?? []) waiter.reject(e)
      }
    }
  }
}

function enqueueResolve(fetchFn: FetchFn, endpoint: string, id: string): Promise<ResolvedRefMatch[]> {
  let queue = resolveQueues.get(endpoint)
  if (!queue) {
    queue = { fetchFn, pending: new Map(), timer: null }
    resolveQueues.set(endpoint, queue)
  }
  const q = queue
  return new Promise<ResolvedRefMatch[]>((resolve, reject) => {
    const waiters = q.pending.get(id)
    if (waiters) waiters.push({ resolve, reject })
    else q.pending.set(id, [{ resolve, reject }])
    q.timer ??= setTimeout(() => void flushResolveQueue(endpoint), RESOLVE_FLUSH_MS)
  })
}

/** Every registered store that recognizes `id`, per the host's resolver; an
 *  empty array is a definitive miss. Batched and cached like the other chip
 *  fetches. */
export function fetchResolvedRef(fetchFn: FetchFn, resolveEndpoint: string, id: string): Promise<ResolvedRefMatch[]> {
  return cached(resolvedRefCache, id, () => enqueueResolve(fetchFn, resolveEndpoint, id))
}

// The chip label emoji categorizes a session the same way the filter bar does:
// by stored `type` (interactive | autonomous | system | herald | external)
// refined with `purpose` (autoworker / herald) and the id prefix, since herald
// and autoworker are purposes of an autonomous/herald session, not distinct
// types. `external` is a type only: the session ran outside the bridge and was
// imported by scanning the harness's on-disk history, so nobody declared a
// purpose for it and it must not read as a human chat.
export function sessionEmoji(type: string, purpose: string, sessionId: string): string {
  if (type === 'herald' || purpose === 'herald' || sessionId.startsWith('herald-')) return '📣'
  if (purpose === 'autoworker' || sessionId.startsWith('autoworker-')) return '🤖'
  if (type === 'interactive') return '💬'
  if (type === 'system') return '⚙️'
  if (type === 'autonomous') return '🛠️'
  if (type === 'external') return '📥'
  return '🔗'
}
