import { useCallback, useEffect, useState } from 'react'
import type { FetchFn } from '../../types'

// ProducerConfig mirrors the configView the producer service returns from
// GET/PUT /config and POST /config/reset-week.
interface ProducerConfig {
  enabled: boolean
  week_limit_usd: number
  week_spent_usd: number
  week_remaining_usd: number
  week_start: string
  week_resets_at: string
}

// ProducerRow is the pinned "Producer" entry at the top of the session sidebar.
// It is deliberately self-contained: it fetches its own state from the producer
// service (proxied at producerBasePath) using the same apiFetch the rest of the
// sidebar uses, so it needs no new provider wiring. If the service is
// unreachable the row still renders, showing an offline state rather than
// breaking the sidebar.
export function ProducerRow({ apiFetch, producerBasePath }: {
  apiFetch: FetchFn
  producerBasePath: string
}) {
  const [cfg, setCfg] = useState<ProducerConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [limitDraft, setLimitDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiFetch(`${producerBasePath}/config`)
      .then(async r => {
        if (!r.ok) throw new Error(`config ${r.status}`)
        const c: ProducerConfig = await r.json()
        setCfg(c)
        setLimitDraft(String(c.week_limit_usd))
        setError(null)
      })
      .catch(e => setError(String(e?.message ?? e)))
  }, [apiFetch, producerBasePath])

  useEffect(() => { load() }, [load])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const r = await apiFetch(`${producerBasePath}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`save ${r.status}`)
      const c: ProducerConfig = await r.json()
      setCfg(c)
      setLimitDraft(String(c.week_limit_usd))
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [apiFetch, producerBasePath])

  const resetWeek = useCallback(async () => {
    setBusy(true)
    try {
      const r = await apiFetch(`${producerBasePath}/config/reset-week`, { method: 'POST' })
      if (!r.ok) throw new Error(`reset ${r.status}`)
      const c: ProducerConfig = await r.json()
      setCfg(c)
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [apiFetch, producerBasePath])

  const enabled = cfg?.enabled ?? false
  const unreachable = !cfg && !!error

  const saveLimit = () => {
    const v = parseFloat(limitDraft)
    if (!Number.isNaN(v) && v >= 0 && v !== cfg?.week_limit_usd) patch({ week_limit_usd: v })
  }

  const pct = cfg && cfg.week_limit_usd > 0
    ? Math.min(100, (100 * cfg.week_spent_usd) / cfg.week_limit_usd)
    : 0

  return (
    <div className={`bc-producer ${enabled ? 'bc-producer-enabled' : ''}`}>
      <div className="bc-session-item bc-producer-row">
        <button
          className="bc-session-item-main"
          onClick={() => setExpanded(x => !x)}
          title={unreachable ? 'Producer service unreachable' : 'Producer — your single point of contact'}
        >
          <span className="bc-session-harness bc-producer-badge" aria-hidden>🎬</span>
          <span className={`bc-producer-dot ${unreachable ? 'off' : enabled ? 'on' : 'idle'}`} />
          <span className="bc-session-label bc-producer-label">Producer</span>
        </button>
        <span
          className="bc-session-menu-btn bc-producer-caret"
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(x => !x)}
          title="Producer settings"
        >{expanded ? '▾' : '⚙'}</span>
      </div>

      {expanded && (
        <div className="bc-producer-panel">
          {unreachable ? (
            <div className="bc-producer-error">Producer offline ({error})</div>
          ) : cfg ? (
            <>
              <button
                className={`bc-producer-enable ${enabled ? 'on' : 'off'}`}
                disabled={busy}
                onClick={() => patch({ enabled: !enabled })}
              >
                {enabled ? '● Enabled — click to disable' : '○ Start / enable chat'}
              </button>

              <label className="bc-producer-limit">
                <span>Weekly limit&nbsp;$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={limitDraft}
                  disabled={busy}
                  onChange={e => setLimitDraft(e.target.value)}
                  onBlur={saveLimit}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </label>

              <div className="bc-producer-meter">
                <div className="bc-producer-meter-bar">
                  <div className="bc-producer-meter-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="bc-producer-meter-label">
                  ${cfg.week_spent_usd.toFixed(2)} spent · ${cfg.week_remaining_usd.toFixed(2)} left this week
                </div>
              </div>

              <div className="bc-producer-actions">
                <span className="bc-producer-reset-note">
                  resets {new Date(cfg.week_resets_at).toLocaleDateString()}
                </span>
                <button className="bc-producer-reset" disabled={busy} onClick={resetWeek}>Reset week</button>
              </div>
              {error && <div className="bc-producer-error">{error}</div>}
            </>
          ) : (
            <div className="bc-producer-loading">Loading…</div>
          )}
        </div>
      )}
    </div>
  )
}
