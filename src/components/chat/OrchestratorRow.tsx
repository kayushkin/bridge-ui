import { useCallback, useEffect, useState } from 'react'
import type { FetchFn } from '../../types'

// OrchestratorConfig mirrors the configView the orchestrator service returns from
// GET/PUT /config and POST /config/reset-week.
export interface OrchestratorConfig {
  enabled: boolean
  week_limit_usd: number
  week_spent_usd: number
  week_remaining_usd: number
  week_start: string
  week_resets_at: string
  /** The llm-bridge session id of the orchestrator's home session. */
  home_session_id: string
}

export interface OrchestratorRowProps {
  apiFetch: FetchFn
  /** Where this host proxies the orchestrator service, from `orchestratorBasePath` on
   *  BridgeProvider. A host that proxies none should not render the row at all
   *  rather than pass an empty string — there is no path to guess. */
  orchestratorBasePath: string
  /** Opens the orchestrator's home session as a chat, the way a session row does.
   *  The caller asks orchestratord for the id (`GET /home-session`) on each click —
   *  see `useHomeSession`. */
  onOpenHomeSession: () => void
  /** Why the home session could not be found or opened, verbatim; shown on the row. */
  homeSessionError: string | null
  /** Whether the home session is the session on screen. */
  selected: boolean
}

// OrchestratorRow is the pinned "Orchestrator" entry at the top of the sidebar. A
// click opens the orchestrator's home session, an ordinary llm-bridge chat
// session. The gear panel fetches its own settings from the orchestrator service
// (proxied at orchestratorBasePath) using the same apiFetch the rest of the sidebar
// uses. If the service is unreachable the row still renders, showing an offline
// state rather than breaking the sidebar.
export function OrchestratorRow({ apiFetch, orchestratorBasePath, onOpenHomeSession, homeSessionError, selected }: OrchestratorRowProps) {
  const [cfg, setCfg] = useState<OrchestratorConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [limitDraft, setLimitDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiFetch(`${orchestratorBasePath}/config`)
      .then(async r => {
        if (!r.ok) throw new Error(`config ${r.status}`)
        const c: OrchestratorConfig = await r.json()
        setCfg(c)
        setLimitDraft(String(c.week_limit_usd))
        setError(null)
      })
      .catch(e => setError(String(e?.message ?? e)))
  }, [apiFetch, orchestratorBasePath])

  useEffect(() => { load() }, [load])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const r = await apiFetch(`${orchestratorBasePath}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`save ${r.status}`)
      const c: OrchestratorConfig = await r.json()
      setCfg(c)
      setLimitDraft(String(c.week_limit_usd))
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [apiFetch, orchestratorBasePath])

  const resetWeek = useCallback(async () => {
    setBusy(true)
    try {
      const r = await apiFetch(`${orchestratorBasePath}/config/reset-week`, { method: 'POST' })
      if (!r.ok) throw new Error(`reset ${r.status}`)
      const c: OrchestratorConfig = await r.json()
      setCfg(c)
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }, [apiFetch, orchestratorBasePath])

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
    <div className={`bc-orchestrator ${enabled ? 'bc-orchestrator-enabled' : ''}`}>
      <div className={`bc-session-item bc-orchestrator-row ${selected ? 'bc-session-item-selected' : ''}`}>
        <button
          className="bc-session-item-main"
          onClick={onOpenHomeSession}
          aria-current={selected || undefined}
          title={unreachable ? 'Orchestrator service unreachable' : 'Open the orchestrator’s chat session'}
        >
          <span className="bc-session-harness bc-orchestrator-badge" aria-hidden>🎬</span>
          <span className={`bc-orchestrator-dot ${unreachable ? 'off' : enabled ? 'on' : 'idle'}`} />
          <span className="bc-session-label bc-orchestrator-label">Orchestrator</span>
        </button>
        <span
          className="bc-session-menu-btn bc-orchestrator-caret"
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(x => !x)}
          title="Orchestrator settings"
        >{expanded ? '▾' : '⚙'}</span>
      </div>

      {homeSessionError && (
        <div className="bc-orchestrator-error" role="alert">
          Cannot open the orchestrator’s session: {homeSessionError}
        </div>
      )}

      {expanded && (
        <div className="bc-orchestrator-panel">
          {unreachable ? (
            <div className="bc-orchestrator-error">Orchestrator offline ({error})</div>
          ) : cfg ? (
            <>
              <button
                className={`bc-orchestrator-enable ${enabled ? 'on' : 'off'}`}
                disabled={busy}
                onClick={() => patch({ enabled: !enabled })}
                title="Autonomous mode: lets the Orchestrator run scheduled sweeps and ping you. Chatting works either way."
              >
                {enabled ? '● Autonomous mode on — click to disable' : '○ Enable autonomous mode'}
              </button>

              <label className="bc-orchestrator-limit" title="0 means no limit">
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

              <div className="bc-orchestrator-meter">
                <div className="bc-orchestrator-meter-bar">
                  <div className="bc-orchestrator-meter-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="bc-orchestrator-meter-label">
                  ${cfg.week_spent_usd.toFixed(2)} spent · {cfg.week_limit_usd > 0
                    ? `$${cfg.week_remaining_usd.toFixed(2)} left this week`
                    : 'no weekly limit'}
                </div>
              </div>

              <div className="bc-orchestrator-actions">
                <span className="bc-orchestrator-reset-note">
                  resets {new Date(cfg.week_resets_at).toLocaleDateString()}
                </span>
                <button className="bc-orchestrator-reset" disabled={busy} onClick={resetWeek}>Reset week</button>
              </div>
              {error && <div className="bc-orchestrator-error">{error}</div>}
            </>
          ) : (
            <div className="bc-orchestrator-loading">Loading…</div>
          )}
        </div>
      )}
    </div>
  )
}
