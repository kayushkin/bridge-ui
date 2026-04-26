import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LogRow } from '../../types'
import { useStickyBottomScroll } from '../../useStickyBottomScroll'
import { ToolContext } from '../tools'
import { FilterBar } from './FilterBar'
import { LogRowView, TurnGroupView, groupRowsByTurn } from './LogRowView'
import { loadHiddenTypes, saveHiddenTypes } from './persistence'
import { typesInRow } from './utils'

export function Thread({ rows, loading, error, agent, sessionId }: {
  rows: LogRow[]
  loading: boolean
  error: string | null
  agent: string
  sessionId: string
}) {
  const { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom } = useStickyBottomScroll<HTMLDivElement>()
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenTypes())

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) for (const t of typesInRow(r)) set.add(t)
    return [...set].sort()
  }, [rows])

  const visibleRows = useMemo(() => {
    if (hidden.size === 0) return rows
    return rows.filter(r => typesInRow(r).some(t => !hidden.has(t)))
  }, [rows, hidden])

  const blocks = useMemo(() => groupRowsByTurn(visibleRows), [visibleRows])

  useEffect(() => { autoScrollIfAtBottom() }, [visibleRows, autoScrollIfAtBottom])

  const toggleType = useCallback((t: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      saveHiddenTypes(next)
      return next
    })
  }, [])

  if (loading) return <div className="bc-thread"><div className="bc-loading">Loading history...</div></div>
  if (rows.length === 0 && !error) return <div className="bc-thread"><div className="bc-empty">Send a message to start</div></div>

  return (
    <ToolContext.Provider value={{ sessionId }}>
    <div className="bc-thread-wrap">
      <div ref={containerRef} className="bc-thread">
        <FilterBar types={allTypes} hidden={hidden} onToggle={toggleType} />
        {error && <div className="bridge-error">{error}</div>}
        {blocks.map((b, i) => b.kind === 'turn'
          ? <TurnGroupView key={`turn_${b.turnId}`} turnId={b.turnId} rows={b.rows} agent={agent} />
          : <LogRowView key={`row_${b.row.key}_${i}`} row={b.row} agent={agent} />
        )}
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
    </ToolContext.Provider>
  )
}
