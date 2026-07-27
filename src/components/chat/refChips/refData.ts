import type { FetchFn } from '../../../types'

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

// The fields the todo chip shows. Sourced from the noteboard item. Fetched
// eagerly too, so the chip can label itself with the todo title.
export interface TodoRef {
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
const todoCache = new Map<string, { at: number; p: Promise<TodoRef> }>()

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

export function fetchTodoRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<TodoRef> {
  return cached(todoCache, itemId, async () => {
    const raw = await getJSON(fetchFn, `${noteboardBasePath}/api/items/${encodeURIComponent(itemId)}`)
    const o = (raw ?? {}) as Record<string, unknown>
    const tags = Array.isArray(o.tags) ? (o.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []
    return {
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

// The chip label emoji categorizes a session the same way the filter bar does:
// by stored `type` (interactive | autonomous | system) refined with `purpose`
// (autoworker / herald) and the id prefix, since herald and autoworker are
// purposes of an autonomous/herald session, not distinct types.
export function sessionEmoji(type: string, purpose: string, sessionId: string): string {
  if (type === 'herald' || purpose === 'herald' || sessionId.startsWith('herald-')) return '📣'
  if (purpose === 'autoworker' || sessionId.startsWith('autoworker-')) return '🤖'
  if (type === 'interactive') return '💬'
  if (type === 'system') return '⚙️'
  if (type === 'autonomous') return '🛠️'
  return '🔗'
}
