import type { FetchFn } from '../../../types'

// The fields the session chip panel shows. Sourced from GET /sessions/{id}
// (display_name, state, type, harness, info.model, updated_at) plus an optional
// cost joined from the aggregates array.
export interface SessionRef {
  display_name: string
  state: string
  type: string
  harness: string
  model: string
  updated_at: string
  cost_usd: number | null
}

// The fields the todo chip panel shows. Sourced from the noteboard item.
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

export async function fetchSessionRef(fetchFn: FetchFn, basePath: string, sessionId: string): Promise<SessionRef> {
  const raw = await getJSON(fetchFn, `${basePath}/sessions/${encodeURIComponent(sessionId)}`)
  const o = (raw ?? {}) as Record<string, unknown>
  const info = (o.info ?? {}) as Record<string, unknown>
  const harnessSessionId = str(o, 'harness_session_id')
  return {
    display_name: str(o, 'display_name'),
    state: str(o, 'state'),
    type: str(o, 'type'),
    harness: str(o, 'harness'),
    model: str(info, 'model'),
    updated_at: str(o, 'updated_at'),
    cost_usd: await lookupCost(fetchFn, basePath, sessionId, harnessSessionId),
  }
}

export async function fetchTodoRef(fetchFn: FetchFn, noteboardBasePath: string, itemId: string): Promise<TodoRef> {
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
}

// There is no per-session cost route: GET /sessions/aggregates returns the
// whole unfiltered array (thousands of rows), and a session's spend is keyed by
// EITHER its bridge session_id OR its harness_session_id. The array is fetched
// once and cached briefly so opening several chips doesn't refetch it. Cost is
// supplementary — if the aggregates call fails, the chip still shows the
// session's core info with no cost rather than erroring out.
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

async function lookupCost(fetchFn: FetchFn, basePath: string, sessionId: string, harnessSessionId: string): Promise<number | null> {
  try {
    const rows = await loadAggregates(fetchFn, basePath)
    const hit = rows.find(r => r.session_id === sessionId || (harnessSessionId !== '' && r.session_id === harnessSessionId))
    return hit ? hit.cost_usd : null
  } catch {
    return null
  }
}
