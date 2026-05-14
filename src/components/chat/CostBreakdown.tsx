import { useEffect, useRef, useState } from 'react'
import type { APISpendTotalEvent, LogRow } from '../../types'
import { formatCost } from '../../utils'

// CostBreakdown renders the session's running cost. When an
// EventAPISpendTotal (server-derived from per-call OTel telemetry) has
// landed, its cumulative TotalUSD is canonical and the chip opens a
// drill-down with ByModel + ByQuerySource breakdowns. When the session
// has no api_call telemetry yet (legacy claudecode runs, harnesses that
// don't emit it), the chip falls back to the per-turn EventResult.Cost
// sum the SessionHeader was computing before.
//
// "Fallback" here is presentation-layer pick-the-best-source, not data
// fabrication: each path reads a real signal the session actually
// produced. Nothing is invented to fill in missing data.
export function CostBreakdown({ rows, fallbackTotalUSD, fallbackTitle }: {
  rows: LogRow[]
  fallbackTotalUSD: number
  /** Tooltip carried over from SessionHeader (e.g. context-tokens info)
   * shown when the fallback figure is displayed. */
  fallbackTitle?: string
}) {
  const apiSpend = latestApiSpend(rows)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (apiSpend && apiSpend.calls > 0) {
    return (
      <div className="bc-cost-wrap" ref={ref}>
        <button
          type="button"
          className={`bc-cost bc-cost-clickable${open ? ' bc-cost-open' : ''}`}
          onClick={() => setOpen(o => !o)}
          title={`${apiSpend.calls} API call${apiSpend.calls === 1 ? '' : 's'} · click for breakdown`}
          aria-expanded={open}
        >
          {formatCost(apiSpend.total_usd)}
          <span className="bc-cost-caret" aria-hidden>▾</span>
        </button>
        {open && <CostDrilldownPanel spend={apiSpend} fallbackTotalUSD={fallbackTotalUSD} />}
      </div>
    )
  }

  if (fallbackTotalUSD > 0) {
    return (
      <span className="bc-cost" title={fallbackTitle}>
        {formatCost(fallbackTotalUSD)}
      </span>
    )
  }

  return null
}

function CostDrilldownPanel({ spend, fallbackTotalUSD }: {
  spend: APISpendTotalEvent
  fallbackTotalUSD: number
}) {
  const byModel = mapEntriesSortedDesc(spend.by_model)
  const bySource = mapEntriesSortedDesc(spend.by_query_source)

  // The delta exists when EventResult.Cost was recording a smaller number
  // than per-call OTel: that's the auxiliary-call overhead (session-title
  // generation, prompt-suggestion). Surface it explicitly rather than
  // forcing users to subtract.
  const overhead = fallbackTotalUSD > 0 ? spend.total_usd - fallbackTotalUSD : 0
  const showOverhead = fallbackTotalUSD > 0 && overhead > 0.000001

  return (
    <div className="bc-cost-panel" role="dialog" aria-label="Cost breakdown">
      <div className="bc-cost-panel-row bc-cost-panel-total">
        <span className="bc-cost-panel-label">API spend</span>
        <span className="bc-cost-panel-value">{formatCost(spend.total_usd)}</span>
      </div>
      <div className="bc-cost-panel-row bc-cost-panel-sub">
        <span className="bc-cost-panel-label">{spend.calls} call{spend.calls === 1 ? '' : 's'}</span>
        <span className="bc-cost-panel-value">
          {(spend.usage?.input_tokens ?? 0).toLocaleString()} in
          {' / '}
          {(spend.usage?.output_tokens ?? 0).toLocaleString()} out
        </span>
      </div>

      {showOverhead && (
        <div className="bc-cost-panel-row bc-cost-panel-overhead">
          <span className="bc-cost-panel-label">vs. turn cost</span>
          <span className="bc-cost-panel-value">+{formatCost(overhead)} aux</span>
        </div>
      )}

      {byModel.length > 0 && (
        <div className="bc-cost-panel-group">
          <div className="bc-cost-panel-group-label">By model</div>
          {byModel.map(([k, v]) => (
            <div key={`m_${k}`} className="bc-cost-panel-row">
              <span className="bc-cost-panel-label">{k}</span>
              <span className="bc-cost-panel-value">{formatCost(v)}</span>
            </div>
          ))}
        </div>
      )}

      {bySource.length > 0 && (
        <div className="bc-cost-panel-group">
          <div className="bc-cost-panel-group-label">By source</div>
          {bySource.map(([k, v]) => (
            <div key={`s_${k}`} className="bc-cost-panel-row">
              <span className="bc-cost-panel-label">{k}</span>
              <span className="bc-cost-panel-value">{formatCost(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// latestApiSpend scans backwards for the most recent api_spend_total row.
// The derivation emits one after every EventAPICall, so the last one in
// the stream carries the cumulative state we want to display.
function latestApiSpend(rows: LogRow[]): APISpendTotalEvent | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const s = rows[i].apiSpendTotal
    if (s) return s
  }
  return null
}

function mapEntriesSortedDesc(m: Record<string, number> | undefined): Array<[string, number]> {
  if (!m) return []
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}
