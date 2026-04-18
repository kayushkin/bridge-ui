import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { formatTokens, timeAgo } from '../utils'
import type { BridgeSession, HarnessInfo } from '../types'

type FilterState = '' | 'running' | 'idle' | 'completed' | 'error' | 'aborted'

const STATE_COLORS: Record<string, string> = {
  running: '#22c55e', idle: '#60a5fa', completed: '#888',
  error: '#ef4444', aborted: '#ef4444', waiting_on_approval: '#f59e0b',
}

interface SearchHit { session_id: string; match_count: number }

interface SessionTokens { input: number; output: number }

export function BridgeSessions() {
  const { fetch: apiFetch, basePath, routes } = useBridgeConfig()
  const [sessions, setSessions] = useState<BridgeSession[]>([])
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
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
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
  }, [apiFetch, basePath])

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

  const harnessMap = useMemo(() => new Map(harnesses.map(h => [h.name, h])), [harnesses])
  const harnessesAvail = useMemo(() => [...new Set(sessions.map(s => s.harness))].sort(), [sessions])
  const states = useMemo(() => [...new Set(sessions.map(s => s.state))].sort(), [sessions])

  const filtered = useMemo(() => {
    let list = [...sessions]
    if (filterHarness) list = list.filter(s => s.harness === filterHarness)
    if (filterState) list = list.filter(s => s.state === filterState)
    if (filterInstance) list = list.filter(s => s.instance_id === filterInstance)
    if (searchHits) list = list.filter(s => searchHits.has(s.bridge_id))
    return list.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [sessions, filterHarness, filterState, filterInstance, searchHits])

  const tokensMapRef = useRef(tokensMap)
  tokensMapRef.current = tokensMap

  useEffect(() => {
    const current = tokensMapRef.current
    const toLoad = filtered.filter(s => s.state !== 'empty' && !current.has(s.bridge_id)).slice(0, 30)
    if (toLoad.length === 0) return

    let cancelled = false
    ;(async () => {
      const next = new Map(current)
      for (const s of toLoad) {
        try {
          const res = await apiFetch(`${basePath}/sessions/${s.bridge_id}/messages`)
          if (!res.ok) continue
          const msgs: Array<{ role: string; meta?: { usage?: Record<string, number> } }> = await res.json() ?? []
          let input = 0, output = 0
          for (const m of msgs) {
            if (m.role === 'assistant' && m.meta?.usage) {
              input += m.meta.usage.input_tokens || 0
              output += m.meta.usage.output_tokens || 0
            }
          }
          next.set(s.bridge_id, { input, output })
        } catch { /* skip */ }
      }
      if (!cancelled) setTokensMap(next)
    })()
    return () => { cancelled = true }
  }, [filtered, apiFetch, basePath])

  const handleClick = (session: BridgeSession) => {
    navigate(routes.chat, { state: { selectSession: session.bridge_id } })
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
            const matchCount = searchHits?.get(s.bridge_id)
            const hinfo = harnessMap.get(s.harness)
            const tokens = tokensMap.get(s.bridge_id)
            const totalTokens = tokens ? tokens.input + tokens.output : undefined
            return (
              <li key={s.bridge_id}>
                <button className="bs-row" onClick={() => handleClick(s)}>
                  <span className="bs-row-harness" title={hinfo?.label || s.harness}>
                    {hinfo?.image
                      ? <img src={`${basePath}${hinfo.image}`} alt={hinfo.label || s.harness} />
                      : <span className="bs-row-emoji">{hinfo?.emoji || '·'}</span>}
                  </span>
                  <span className="bs-state-dot" style={{ background: STATE_COLORS[s.state] || '#888' }} />
                  <span className="bs-row-name">{s.display_name || s.bridge_id.slice(0, 16)}</span>
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
