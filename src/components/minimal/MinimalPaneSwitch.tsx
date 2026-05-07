import type { PaneKey } from '../chat/types'
import { useMinimalChrome } from './MinimalChromeContext'

const PANES: { key: PaneKey; label: string }[] = [
  { key: 'turns', label: 'Turns' },
  { key: 'thread', label: 'Thread' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'git', label: 'Git' },
  { key: 'kanban', label: 'Kanban' },
]

export function MinimalPaneSwitch() {
  const { mobilePane, setMobilePane } = useMinimalChrome()
  return (
    <div className="bc-mc-paneswitch" role="tablist" aria-label="Pane">
      {PANES.map(p => (
        <button
          key={p.key}
          type="button"
          role="tab"
          aria-selected={mobilePane === p.key}
          className={`bc-mc-paneswitch-btn ${mobilePane === p.key ? 'bc-mc-paneswitch-btn-active' : ''}`}
          onClick={() => setMobilePane(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
