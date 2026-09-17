import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFilters, useSessionList, type SessionSummary } from '@kayushkin/chat-core'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { useBridgeHarnesses } from '../useBridgeHarnesses'
import { formatTokens, timeAgo } from '../utils'

const STATE_COLORS: Record<string, string> = {
  running: '#22c55e', idle: '#60a5fa', completed: '#888',
  error: '#ef4444', aborted: '#ef4444', waiting_on_approval: '#f59e0b',
}

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
type TokenColumnSession = { sessionId: string; state: string }

/** True when some session on screen has no token total yet, which is what
 *  makes the page ask the server for the aggregate. */
export function sessionTokenTotalsAreMissing(
  sessions: TokenColumnSession[],
  known: Map<string, SessionTokens>,
): boolean {
  return sessions.some(s => s.state !== 'empty' && !known.has(s.sessionId))
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
    if (s.state !== 'empty' && !next.has(s.sessionId)) {
      next.set(s.sessionId, { input: 0, output: 0 })
    }
  }
  return next
}

/** Every session as a flat table, over the SAME store and the SAME filter the
 *  chat sidebar reads. This page used to hold a second copy of the list — its
 *  own `GET /sessions` seed and `/session-events` stream, its own transcript
 *  search — that predated chat-core and was never moved when the chat was.
 *  Filtering here now filters the sidebar and vice versa, which is the honest
 *  consequence of one list: the two were never different sessions.
 *
 *  The page's dropdowns are single-select over chat-core's multi-select axes,
 *  so each writes a one-element list and shows the first element back.
 *  `machine` is the instance axis (it matches `SessionSummary.instanceId`). */
export function BridgeSessions() {
  const { fetch: apiFetch, basePath, routes } = useBridgeConfig()
  const { groups, loading, facets, moreSessions, loadingOlderSessions, loadOlderSessions } = useSessionList()
  const { filter, set, contentSearchReach, searching, searchError } = useFilters()
  const [tokensMap, setTokensMap] = useState<Map<string, SessionTokens>>(new Map())
  const inst = useBridgeInstances()
  const { harnessMap } = useBridgeHarnesses()
  const navigate = useNavigate()

  // The groups are the sidebar's folders; this table has no folders, so it
  // flattens them and orders by recency. Every filter axis, including the
  // transcript search, is already applied by the store's selector.
  const sessions = useMemo<SessionSummary[]>(
    () => groups.flatMap(g => g.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [groups],
  )

  const harnessesAvail = useMemo(() => Object.keys(facets.harness).sort(), [facets])
  const states = useMemo(() => Object.keys(facets.status).sort(), [facets])
  const searchQuery = filter.search.trim()

  const tokensMapRef = useRef(tokensMap)
  tokensMapRef.current = tokensMap

  // Token totals for the rows come from the server-side aggregate, one request
  // covering every session. This column used to fetch each session's FULL
  // message history and add the usage up in the browser, capped at 30 sessions
  // because a single one of those downloads reaches 306MB / 52s on a long
  // session. The aggregate is the same sum over the same result events — see
  // log-store ListSessionAggregates — so the number is unchanged, and the cap
  // is gone with the cost that forced it.
  //
  // One aggregate request at a time. The effect re-runs whenever `sessions`
  // changes identity, which the live store makes happen on every upsert — and
  // the response is 2.8MB that takes seconds to arrive on this host, so without
  // this guard each frame that lands mid-flight starts another full download
  // of the same bytes. Measured on the live box: 23 requests and 65.7MB in 24
  // seconds.
  //
  // The guard is a skip, not a queue. A request already in flight will apply
  // its answer to whatever the list holds when it lands, so a skipped run has
  // nothing to add; if rows are still missing after that, the next change to
  // `sessions` runs it again. Refs are read inside the async body for the same
  // reason — the values that matter are the ones at completion, not at call.
  const aggregatesInFlight = useRef(false)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => {
    if (aggregatesInFlight.current) return
    if (!sessionTokenTotalsAreMissing(sessions, tokensMapRef.current)) return

    let cancelled = false
    aggregatesInFlight.current = true
    ;(async () => {
      try {
        const res = await apiFetch(`${basePath}/sessions/aggregates`)
        if (!res.ok) return
        const aggregates: SessionAggregate[] = await res.json() ?? []
        if (cancelled) return
        setTokensMap(applySessionAggregates(tokensMapRef.current, aggregates, sessionsRef.current))
      } catch { /* leave the column blank */ }
      finally { aggregatesInFlight.current = false }
    })()
    return () => { cancelled = true }
  }, [sessions, apiFetch, basePath])

  // The chat opens a session from its `?session=` deep link. This used to pass the id
  // as navigation state, which nothing reads, so a click landed on the chat with the
  // previous session still open.
  const handleClick = (session: SessionSummary) => {
    navigate(`${routes.chat}?session=${encodeURIComponent(session.sessionId)}`)
  }

  return (
    <div className="bs-container">
      <div className="bs-header">
        <h2>All Sessions</h2>
        <div className="bs-counts">
          {Object.entries(facets.status).map(([state, n]) => (
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
          value={filter.search}
          onChange={e => set({ search: e.target.value })}
          className="bs-search"
        />
        <select value={filter.harness[0] ?? ''} onChange={e => set({ harness: e.target.value ? [e.target.value] : [] })}>
          <option value="">All harnesses</option>
          {harnessesAvail.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select value={filter.status[0] ?? ''} onChange={e => set({ status: e.target.value ? [e.target.value] : [] })}>
          <option value="">All states</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.machine[0] ?? ''} onChange={e => set({ machine: e.target.value ? [e.target.value] : [] })}>
          <option value="">All instances</option>
          {inst.instances.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {searching && <span className="bs-search-status">Searching…</span>}
        {searchQuery && !searching && !searchError && (
          <span className="bs-search-status">{sessions.length} match{sessions.length === 1 ? '' : 'es'}</span>
        )}
      </div>

      {/* The count above deliberately does not render on a failure: there is no
          match count to report, because the search never ran. The list is then
          name matches only, and says so. */}
      {searchQuery && searchError && (
        <div className="bs-search-degraded" role="status">
          Message-content search failed ({searchError}) — the list below is NOT filtered by your search.
        </div>
      )}
      {contentSearchReach && contentSearchReach.hiddenHitCount > 0 && (
        <div className="bs-search-degraded" role="status">
          {contentSearchReach.shownHitCount} of {contentSearchReach.truncated ? 'at least ' : ''}
          {contentSearchReach.hitCount} transcript {contentSearchReach.hitCount === 1 ? 'match' : 'matches'} shown — the rest are filtered out or not loaded.
        </div>
      )}

      {loading ? (
        <div className="bs-loading">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="bs-empty">No sessions match filters</div>
      ) : (
        <ul className="bs-list">
          {sessions.map(s => {
            const instance = s.instanceId ? inst.instanceMap.get(s.instanceId) : undefined
            const hinfo = harnessMap.get(s.harness)
            const tokens = tokensMap.get(s.sessionId)
            const totalTokens = tokens ? tokens.input + tokens.output : undefined
            const state = s.state
            return (
              <li key={s.sessionId}>
                <button className="bs-row" onClick={() => handleClick(s)}>
                  <span className="bs-row-harness" title={hinfo?.label || s.harness}>
                    {hinfo?.image
                      ? <img src={`${basePath}${hinfo.image}`} alt={hinfo.label || s.harness} />
                      : <span className="bs-row-emoji">{hinfo?.emoji || '·'}</span>}
                  </span>
                  <span className="bs-state-dot" style={{ background: STATE_COLORS[state] || '#888' }} />
                  <span className="bs-row-name">{s.displayName || s.sessionId.slice(0, 16)}</span>
                  {instance && <span className="bs-row-instance">{instance.name}</span>}
                  <span className="bs-row-tokens">
                    {totalTokens !== undefined && totalTokens > 0 ? `${formatTokens(totalTokens)} tok` : ''}
                  </span>
                  <span className="bs-row-time">{timeAgo(s.updatedAt)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* The store pages the list; the sidebar deepens it in the background and
          this table offers the same step explicitly. */}
      {moreSessions && (
        <button type="button" className="bs-load-older" onClick={loadOlderSessions} disabled={loadingOlderSessions}>
          {loadingOlderSessions ? 'Loading older sessions…' : 'Load older sessions'}
        </button>
      )}
    </div>
  )
}
