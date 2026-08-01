import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeHarnesses } from '../useBridgeHarnesses'
import { formatTokens, timeAgo } from '../utils'
import type { BridgeSession } from '../types'

type FilterState = '' | 'running' | 'idle' | 'completed' | 'error' | 'aborted'

const STATE_COLORS: Record<string, string> = {
  running: '#22c55e', idle: '#60a5fa', completed: '#888',
  error: '#ef4444', aborted: '#ef4444', waiting_on_approval: '#f59e0b',
}

interface SearchHit { session_id: string; match_count: number }

interface SessionTokens { input: number; output: number }

// One row of GET /sessions/aggregates — log-store's per-session projection of
// the result events, the same source BridgeUsage reads. Only the token totals
// are used here; the rest of the row is ignored.
interface SessionAggregate {
  session_id: string
  input_tokens: number
  output_tokens: number
}

/** A session the token column can show a number for. `empty` sessions never
 *  had a turn, so they are excluded here and never counted as missing. */
type TokenColumnSession = { session_id: string; state: string }

/** True when some session on screen has no token total yet, which is what
 *  makes the page ask the server for the aggregate. */
export function sessionTokenTotalsAreMissing(
  sessions: TokenColumnSession[],
  known: Map<string, SessionTokens>,
): boolean {
  return sessions.some(s => s.state !== 'empty' && !known.has(s.session_id))
}

/**
 * Folds one GET /sessions/aggregates response into the token map.
 *
 * Sessions the aggregate omits (log-store leaves out any session with no
 * usage at all) are recorded as zero rather than left absent. Without that,
 * `sessionTokenTotalsAreMissing` would stay true for them forever and the
 * page would re-fetch the whole aggregate on every render.
 */
export function applySessionAggregates(
  known: Map<string, SessionTokens>,
  aggregates: SessionAggregate[],
  onScreen: TokenColumnSession[],
): Map<string, SessionTokens> {
  const next = new Map(known)
  for (const a of aggregates) {
    next.set(a.session_id, { input: a.input_tokens || 0, output: a.output_tokens || 0 })
  }
  for (const s of onScreen) {
    if (s.state !== 'empty' && !next.has(s.session_id)) {
      next.set(s.session_id, { input: 0, output: 0 })
    }
  }
  return next
}

export function BridgeSessions() {
  const { fetch: apiFetch, basePath, routes } = useBridgeConfig()
  const [sessions, setSessions] = useState<BridgeSession[]>([])
  const [tokensMap, setTokensMap] = useState<Map<string, SessionTokens>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filterHarness, setFilterHarness] = useState('')
  const [filterState, setFilterState] = useState<FilterState>('')
  const [filterInstance, setFilterInstance] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<Map<string, number> | null>(null)
  const [searching, setSearching] = useState(false)
  const inst = useBridgeInstances()
  const { harnessMap } = useBridgeHarnesses()
  const navigate = useNavigate()

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`${basePath}/sessions`)
      if (res.ok) setSessions(await res.json() ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [apiFetch, basePath])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 15000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (!searchQuery) {
      setSearchHits(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    apiFetch(`${basePath}/sessions/search?q=${encodeURIComponent(searchQuery)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`search failed: ${r.status}`)
        const hits: SearchHit[] = await r.json() ?? []
        if (cancelled) return
        setSearchHits(new Map(hits.map(h => [h.session_id, h.match_count])))
      })
      .catch(() => { if (!cancelled) setSearchHits(new Map()) })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [searchQuery, apiFetch, basePath])

  const harnessesAvail = useMemo(() => [...new Set(sessions.map(s => s.harness))].sort(), [sessions])
  const states = useMemo(() => [...new Set(sessions.map(s => s.state))].sort(), [sessions])

  const filtered = useMemo(() => {
    let list = [...sessions]
    if (filterHarness) list = list.filter(s => s.harness === filterHarness)
    if (filterState) list = list.filter(s => s.state === filterState)
    if (filterInstance) list = list.filter(s => s.instance_id === filterInstance)
    if (searchHits) list = list.filter(s => searchHits.has(s.session_id))
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [sessions, filterHarness, filterState, filterInstance, searchHits])

  const tokensMapRef = useRef(tokensMap)
  tokensMapRef.current = tokensMap

  // Token totals for the rows come from the server-side aggregate, one request
  // covering every session. This column used to fetch each session's FULL
  // message history and add the usage up in the browser, capped at 30 sessions
  // because a single one of those downloads reaches 306MB / 52s on a long
  // session. The aggregate is the same sum over the same result events — see
  // log-store ListSessionAggregates — so the number is unchanged, and the cap
  // is gone with the cost that forced it.
  useEffect(() => {
    const current = tokensMapRef.current
    if (!sessionTokenTotalsAreMissing(filtered, current)) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(`${basePath}/sessions/aggregates`)
        if (!res.ok) return
        const aggregates: SessionAggregate[] = await res.json() ?? []
        if (cancelled) return
        setTokensMap(applySessionAggregates(current, aggregates, filtered))
      } catch { /* leave the column blank */ }
    })()
    return () => { cancelled = true }
  }, [filtered, apiFetch, basePath])

  const handleClick = (session: BridgeSession) => {
    navigate(routes.chat, { state: { selectSession: session.session_id } })
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of sessions) c[s.state] = (c[s.state] || 0) + 1
    return c
  }, [sessions])

  return (
    <div className="bs-container">
      <div className="bs-header">
        <h2>All Sessions</h2>
        <div className="bs-counts">
          {Object.entries(counts).map(([state, n]) => (
            <span key={state} className="bs-count-badge" style={{ color: STATE_COLORS[state] || '#888' }}>
              {n} {state}
            </span>
          ))}
        </div>
      </div>

      <div className="bs-filters">
        <input
          type="search"
          placeholder="Search message content…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="bs-search"
        />
        <select value={filterHarness} onChange={e => setFilterHarness(e.target.value)}>
          <option value="">All harnesses</option>
          {harnessesAvail.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select value={filterState} onChange={e => setFilterState(e.target.value as FilterState)}>
          <option value="">All states</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterInstance} onChange={e => setFilterInstance(e.target.value)}>
          <option value="">All instances</option>
          {inst.instances.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {searching && <span className="bs-search-status">Searching…</span>}
        {!searching && searchHits && (
          <span className="bs-search-status">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
        )}
      </div>

      {loading ? (
        <div className="bs-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bs-empty">No sessions match filters</div>
      ) : (
        <ul className="bs-list">
          {filtered.map(s => {
            const instance = s.instance_id ? inst.instanceMap.get(s.instance_id) : undefined
            const matchCount = searchHits?.get(s.session_id)
            const hinfo = harnessMap.get(s.harness)
            const tokens = tokensMap.get(s.session_id)
            const totalTokens = tokens ? tokens.input + tokens.output : undefined
            return (
              <li key={s.session_id}>
                <button className="bs-row" onClick={() => handleClick(s)}>
                  <span className="bs-row-harness" title={hinfo?.label || s.harness}>
                    {hinfo?.image
                      ? <img src={`${basePath}${hinfo.image}`} alt={hinfo.label || s.harness} />
                      : <span className="bs-row-emoji">{hinfo?.emoji || '·'}</span>}
                  </span>
                  <span className="bs-state-dot" style={{ background: STATE_COLORS[s.state] || '#888' }} />
                  <span className="bs-row-name">{s.display_name || s.session_id.slice(0, 16)}</span>
                  {instance && <span className="bs-row-instance">{instance.name}</span>}
                  <span className="bs-row-tokens">
                    {totalTokens !== undefined && totalTokens > 0 ? `${formatTokens(totalTokens)} tok` : ''}
                  </span>
                  {matchCount !== undefined && (
                    <span className="bs-match-badge">{matchCount} match{matchCount === 1 ? '' : 'es'}</span>
                  )}
                  <span className="bs-row-time">{timeAgo(s.updated_at)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
