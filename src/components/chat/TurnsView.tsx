import { useCallback, useEffect, useMemo } from 'react'
import type { LogRow } from '../../types'
import { useStickyBottomScroll } from '../../useStickyBottomScroll'
import { UsageLine } from './UsageLine'
import { formatHMS } from './utils'
import type { TurnsItem } from './types'

function rowsToTurns(rows: LogRow[]): TurnsItem[] {
  const out: TurnsItem[] = []
  for (const row of rows) {
    if (row.kind === 'user_message' && row.text) {
      out.push({
        key: `tv_user_${row.key}`,
        actor: 'user',
        text: row.text,
        ts: row.timestamp,
        turnId: row.turnId,
      })
    } else if (row.kind === 'result' && row.done) {
      const text = row.text || row.meta?.text
      if (text) {
        out.push({
          key: `tv_res_${row.key}`,
          actor: 'assistant',
          text,
          ts: row.timestamp,
          turnId: row.turnId,
          usage: row.usage || row.meta?.usage,
          isError: row.meta?.is_error,
        })
      }
    } else if (row.kind === 'error' && row.errorMessage) {
      out.push({
        key: `tv_err_${row.key}`,
        actor: 'assistant',
        text: row.errorMessage,
        ts: row.timestamp,
        turnId: row.turnId,
        isError: true,
      })
    }
  }
  return out
}

export function TurnsView({ rows, agent, onToggleCollapse, style, paneKey }: {
  rows: LogRow[]
  agent: string
  onToggleCollapse: () => void
  style?: React.CSSProperties
  paneKey?: string
}) {
  const { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom } = useStickyBottomScroll<HTMLDivElement>()
  const items = useMemo(() => rowsToTurns(rows), [rows])
  useEffect(() => { autoScrollIfAtBottom() }, [items.length, autoScrollIfAtBottom])

  const onHeaderKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() }
  }, [onToggleCollapse])

  return (
    <div className="bc-turns-pane" style={style} data-pane={paneKey}>
      <div
        className="bc-turns-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={onHeaderKey}
        role="button"
        tabIndex={0}
        title="Hide turns"
        aria-label="Hide turns"
      >
        <span className="bc-turns-title">Turns</span>
        <span className="bc-turns-count">{items.length}</span>
        <span className="bc-spacer" />
        <span className="bc-turns-collapse-btn" aria-hidden="true">×</span>
      </div>
      <div ref={containerRef} className="bc-turns-body">
        {items.length === 0 && <div className="bc-turns-empty">No messages yet</div>}
        {items.map(it => (
          <div key={it.key} className={`bc-turns-item bc-turns-${it.actor}${it.isError ? ' bc-turns-error' : ''}`} title={it.text}>
            <div className="bc-turns-meta">
              <span className="bc-turns-actor">{it.actor === 'user' ? 'You' : agent || 'assistant'}</span>
              <span className="bc-turns-ts">{formatHMS(it.ts)}</span>
              {it.usage && <UsageLine usage={it.usage} />}
            </div>
            <div className="bc-turns-text">{it.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!isAtBottom && (
        <button
          type="button"
          className="bc-jump-latest"
          onClick={() => scrollToBottom()}
          title="Jump to latest"
          aria-label="Jump to latest"
        >↓ New messages</button>
      )}
    </div>
  )
}
