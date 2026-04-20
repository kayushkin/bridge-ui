import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { formatTokens, formatDuration } from '../utils'
import type { BridgeSession } from '../types'

interface SessionUsage {
  sessionId: string
  harness: string
  instanceId: string
  inputTokens: number
  outputTokens: number
  cost: number
  durationMs: number
  model: string
  turns: number
}

interface LimitWindow {
  used_percent: number
  window_minutes?: number
  resets_at?: number // unix seconds
}

interface ProviderLimits {
  provider: string
  plan_type?: string
  tier?: string
  windows: Record<string, LimitWindow>
  snapshot_at: number
  source: string
  stale_after?: number
}

type LimitsResponse = Record<string, ProviderLimits | null>

type Period = 'day' | 'week' | 'month'

const WINDOW_LABELS: Record<string, string> = {
  five_hour: '5-Hour',
  seven_day: '7-Day',
  seven_day_oauth_apps: '7-Day OAuth Apps',
  seven_day_opus: '7-Day Opus',
  seven_day_sonnet: '7-Day Sonnet',
  seven_day_cowork: '7-Day Cowork',
  weekly: 'Weekly',
  extra_usage: 'Extra Usage',
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  codex: 'Codex',
}

function formatTimeUntil(unixSec: number): string {
  const diffMs = unixSec * 1000 - Date.now()
  if (diffMs <= 0) return 'now'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`
  const days = Math.floor(hrs / 24)
  const remHrs = hrs % 24
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`
}

function LimitBar({ label, win }: { label: string; win: LimitWindow }) {
  const pct = Math.min(win.used_percent, 100)
  const color = pct >= 80 ? '#ef5350' : pct >= 50 ? '#ffa726' : '#66bb6a'
  return (
    <div className="bu-limit-item">
      <div className="bu-limit-header">
        <span className="bu-limit-label">{label}</span>
        <span className="bu-limit-pct" style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="bu-limit-track">
        <div className="bu-limit-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {win.resets_at != null && (
        <span className="bu-limit-reset">resets in {formatTimeUntil(win.resets_at)}</span>
      )}
    </div>
  )
}

function periodCutoff(period: Period): string {
  const ms = period === 'day' ? 86400000 : period === 'week' ? 604800000 : 2592000000
  return new Date(Date.now() - ms).toISOString()
}

export function BridgeUsage() {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const [sessions, setSessions] = useState<BridgeSession[]>([])
  const [usageMap, setUsageMap] = useState<Map<string, SessionUsage>>(new Map())
  const [limits, setLimits] = useState<LimitsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [period, setPeriod] = useState<Period>('day')
  const inst = useBridgeInstances()

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`${basePath}/sessions`)
      if (res.ok) setSessions(await res.json() ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [apiFetch, basePath])

  // Subscription limits live on usage-store (via dash proxy at /api/usage/limits).
  // No basePath — this endpoint is site-global, not bridge-specific.
  const fetchLimits = useCallback(async () => {
    try {
      const res = await apiFetch('/api/usage/limits')
      if (res.ok) setLimits(await res.json())
    } catch { /* ignore */ }
  }, [apiFetch])

  useEffect(() => { fetchSessions() }, [fetchSessions])
  useEffect(() => {
    fetchLimits()
    const t = setInterval(fetchLimits, 60000)
    return () => clearInterval(t)
  }, [fetchLimits])

  const periodSessions = useMemo(() => {
    const cutoff = periodCutoff(period)
    return sessions.filter(s => s.created_at >= cutoff)
  }, [sessions, period])

  const usageMapRef = useRef(usageMap)
  usageMapRef.current = usageMap

  useEffect(() => {
    const current = usageMapRef.current
    const toLoad = periodSessions.filter(s =>
      (s.state === 'completed' || s.state === 'idle' || s.state === 'running') && !current.has(s.bridge_id)
    ).slice(0, 20)

    if (toLoad.length === 0) return
    setLoadingUsage(true)

    ;(async () => {
      const newEntries = new Map(current)
      for (const s of toLoad) {
        try {
          const res = await apiFetch(`${basePath}/sessions/${s.bridge_id}/messages`)
          if (!res.ok) continue
          const msgs: Array<{ role: string; meta?: { usage?: Record<string, number>; cost?: Record<string, number>; duration_ms?: number; model?: string } }> = await res.json() ?? []
          let input = 0, output = 0, cost = 0, duration = 0, turns = 0
          let model = ''
          for (const m of msgs) {
            if (m.role === 'assistant' && m.meta) {
              input += m.meta.usage?.input_tokens || 0
              output += m.meta.usage?.output_tokens || 0
              cost += m.meta.cost?.total_usd || 0
              duration += m.meta.duration_ms || 0
              turns++
              if (m.meta.model) model = m.meta.model
            }
          }
          newEntries.set(s.bridge_id, { sessionId: s.bridge_id, harness: s.harness, instanceId: s.instance_id ?? '', inputTokens: input, outputTokens: output, cost, durationMs: duration, model, turns })
        } catch { /* skip */ }
      }
      setUsageMap(newEntries)
      setLoadingUsage(false)
    })()
  }, [periodSessions, apiFetch, basePath])

  const harnessGroups = useMemo(() => {
    const groups = new Map<string, { sessions: SessionUsage[]; totals: { input: number; output: number; cost: number; duration: number; turns: number } }>()
    for (const s of periodSessions) {
      const usage = usageMap.get(s.bridge_id)
      if (!usage) continue
      let g = groups.get(s.harness)
      if (!g) { g = { sessions: [], totals: { input: 0, output: 0, cost: 0, duration: 0, turns: 0 } }; groups.set(s.harness, g) }
      g.sessions.push(usage)
      g.totals.input += usage.inputTokens
      g.totals.output += usage.outputTokens
      g.totals.cost += usage.cost
      g.totals.duration += usage.durationMs
      g.totals.turns += usage.turns
    }
    return groups
  }, [periodSessions, usageMap])

  const totals = useMemo(() => {
    let input = 0, output = 0, cost = 0, duration = 0, count = 0
    for (const [, g] of harnessGroups) {
      input += g.totals.input; output += g.totals.output; cost += g.totals.cost
      duration += g.totals.duration; count += g.sessions.length
    }
    return { input, output, cost, duration, count }
  }, [harnessGroups])

  return (
    <div className="bu-container">
      <div className="bu-header">
        <h2>Bridge Usage</h2>
        <div className="bu-period-tabs">
          {(['day', 'week', 'month'] as Period[]).map(p => (
            <button key={p} className={`bu-tab ${period === p ? 'bu-tab-active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'day' ? '24h' : p === 'week' ? '7d' : '30d'}
            </button>
          ))}
        </div>
      </div>

      {limits && (
        <div className="bu-limits-section">
          {Object.entries(limits).map(([provider, p]) => {
            if (!p) return null
            const stale = p.stale_after != null && Date.now() / 1000 > p.stale_after
            const windowEntries = Object.entries(p.windows).filter(([, w]) => w.used_percent > 0 || w.resets_at != null)
            if (windowEntries.length === 0) return null
            return (
              <div key={provider} className="bu-limits-provider">
                <div className="bu-limits-header">
                  <span className="bu-limits-title">{PROVIDER_LABELS[provider] ?? provider}</span>
                  {p.plan_type && <span className="bu-limits-tier">{p.plan_type}{p.tier?.includes('20x') ? ' 20x' : p.tier?.includes('5x') ? ' 5x' : ''}</span>}
                  {stale && <span className="bu-limits-stale" title={`snapshot from ${new Date(p.snapshot_at * 1000).toLocaleString()}`}>stale</span>}
                </div>
                <div className="bu-limits-grid">
                  {windowEntries.map(([key, win]) => (
                    <LimitBar key={key} label={WINDOW_LABELS[key] ?? key} win={win} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="bu-loading">Loading...</div>
      ) : (
        <>
          <div className="bu-totals-row">
            <div className="bu-total-card"><span className="bu-total-label">Sessions</span><span className="bu-total-value">{totals.count}</span></div>
            <div className="bu-total-card"><span className="bu-total-label">Input</span><span className="bu-total-value">{formatTokens(totals.input)}</span></div>
            <div className="bu-total-card"><span className="bu-total-label">Output</span><span className="bu-total-value">{formatTokens(totals.output)}</span></div>
            {totals.cost > 0 && <div className="bu-total-card"><span className="bu-total-label">Cost</span><span className="bu-total-value">${totals.cost.toFixed(2)}</span></div>}
            <div className="bu-total-card"><span className="bu-total-label">Time</span><span className="bu-total-value">{formatDuration(totals.duration)}</span></div>
          </div>

          {loadingUsage && <div className="bu-loading-small">Loading session details...</div>}

          {Array.from(harnessGroups.entries()).map(([harness, group]) => (
            <div key={harness} className="bu-harness-section">
              <div className="bu-harness-header">
                <span className="bu-harness-name">{harness}</span>
                <span className="bu-harness-summary">
                  {group.sessions.length} sessions &middot; {formatTokens(group.totals.input + group.totals.output)} tokens
                  {group.totals.cost > 0 && ` \u00B7 $${group.totals.cost.toFixed(2)}`}
                </span>
              </div>
              <div className="bu-token-bar">
                <div className="bu-token-bar-in" style={{ width: `${(group.totals.input / (group.totals.input + group.totals.output || 1)) * 100}%` }} />
                <div className="bu-token-bar-out" style={{ width: `${(group.totals.output / (group.totals.input + group.totals.output || 1)) * 100}%` }} />
              </div>
              <div className="bu-session-list">
                {group.sessions.sort((a, b) => b.cost - a.cost).map(u => {
                  const instance = inst.instanceMap.get(u.instanceId)
                  return (
                    <div key={u.sessionId} className="bu-session-row">
                      <span className="bu-session-id">{u.sessionId.slice(0, 16)}</span>
                      {instance && <span className="bu-instance-label">{instance.name}</span>}
                      <span className="bu-session-model">{u.model?.replace(/^claude-/, '').replace(/\[.*$/, '')}</span>
                      <span>{u.turns} turns</span>
                      <span>{formatTokens(u.inputTokens)} in</span>
                      <span>{formatTokens(u.outputTokens)} out</span>
                      {u.cost > 0 && <span>${u.cost.toFixed(3)}</span>}
                      {u.durationMs > 0 && <span>{formatDuration(u.durationMs)}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {harnessGroups.size === 0 && !loadingUsage && (
            <div className="bu-empty">No usage data for this period</div>
          )}
        </>
      )}
    </div>
  )
}
