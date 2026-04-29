import { useEffect, useRef, useState } from 'react'
import type { SplitMode } from './types'

interface SplitButtonsProps {
  onSplit: (mode: SplitMode) => void
  active?: SplitMode | null
  size?: 'sm' | 'md'
  autoTitle?: string
  chooseTitle?: string
}

const DIRECTIONS: { mode: SplitMode; glyph: string; title: string; cell: string }[] = [
  { mode: 'split-up',    glyph: '↑', title: 'Split above focused pane',          cell: 'up' },
  { mode: 'split-left',  glyph: '←', title: 'Split left of focused pane',        cell: 'left' },
  { mode: 'split-right', glyph: '→', title: 'Split right of focused pane',       cell: 'right' },
  { mode: 'split-down',  glyph: '↓', title: 'Split below focused pane',          cell: 'down' },
]

export function SplitButtons({
  onSplit,
  active,
  size = 'sm',
  autoTitle = 'Split focused pane (auto direction)',
  chooseTitle = 'Choose split direction',
}: SplitButtonsProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const sizeClass = size === 'md' ? 'bc-split-btns-md' : 'bc-split-btns-sm'
  const directionalActive = DIRECTIONS.some(d => d.mode === active)

  return (
    <span ref={wrapRef} className={`bc-split-btns ${sizeClass}`} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className={`bc-split-btn bc-split-btn-auto ${active === 'split-auto' ? 'bc-split-btn-active' : ''}`}
        title={autoTitle}
        aria-label={autoTitle}
        onClick={() => onSplit('split-auto')}
      >⊞</button>
      <button
        type="button"
        className={`bc-split-btn bc-split-btn-choose ${directionalActive ? 'bc-split-btn-active' : ''}`}
        title={chooseTitle}
        aria-label={chooseTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >▾</button>
      {open && (
        <span className="bc-split-popover" role="menu">
          <span className="bc-split-popover-grid">
            {DIRECTIONS.map(d => (
              <button
                key={d.mode}
                type="button"
                role="menuitem"
                className={`bc-split-popover-btn bc-split-popover-${d.cell} ${active === d.mode ? 'bc-split-btn-active' : ''}`}
                title={d.title}
                aria-label={d.title}
                onClick={() => { setOpen(false); onSplit(d.mode) }}
              >{d.glyph}</button>
            ))}
            <span className="bc-split-popover-center" aria-hidden="true">▦</span>
          </span>
        </span>
      )}
    </span>
  )
}
