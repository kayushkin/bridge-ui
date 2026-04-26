import type { PaneKey, PanesHidden } from './types'

export function PaneToggles({ panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseAll }: {
  panesHidden: PanesHidden
  onToggleTurns: () => void
  onToggleThread: () => void
  onToggleTimeline: () => void
  onToggleGit: () => void
  onCloseAll: () => void
}) {
  const allClosed = panesHidden.turns && panesHidden.thread && panesHidden.timeline && panesHidden.git
  const pill = (key: PaneKey, label: string, onClick: () => void) => {
    const visible = !panesHidden[key]
    return (
      <button
        className={`bc-pane-toggle ${visible ? 'bc-pane-toggle-on' : ''}`}
        onClick={onClick}
        title={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-pressed={visible}
      >{label}</button>
    )
  }
  return (
    <div className="bc-pane-toggles" role="group" aria-label="Pane visibility">
      {pill('turns', 'Turns', onToggleTurns)}
      {pill('thread', 'Thread', onToggleThread)}
      {pill('timeline', 'Timeline', onToggleTimeline)}
      {pill('git', 'Git', onToggleGit)}
      <button
        className="bc-pane-close-all"
        onClick={onCloseAll}
        disabled={allClosed}
        title="Close all panes"
        aria-label="Close all panes"
      >×</button>
    </div>
  )
}
