import { useState } from 'react'
import type { MessageMeta } from '../../types'
import { flattenToRows } from './utils'

export function MessageStats({ meta }: { meta: MessageMeta }) {
  const [open, setOpen] = useState(false)
  const rows = flattenToRows(meta as unknown as Record<string, unknown>)

  return (
    <div className="bc-stats-wrapper">
      <button className="bc-stats-toggle" onClick={() => setOpen(v => !v)}>
        {open ? '\u25BE' : '\u25B8'} Stats ({rows.length})
      </button>
      {open && (
        <div className="bc-stats-dropdown">
          {rows.map(([label, val], i) => (
            <div key={`${label}-${i}`} className="bc-stats-row">
              <span className="bc-stats-label">{label}</span>
              <span className="bc-stats-value">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
