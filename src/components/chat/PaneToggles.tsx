import type { PaneKey, PanesHidden } from './types'

export function PaneToggles({ panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onToggleKanban, onToggleAttach, attachAvailable }: {
  panesHidden: PanesHidden
  onToggleTurns: () => void
  onToggleThread: () => void
  onToggleTimeline: () => void
  onToggleGit: () => void
  onToggleKanban: () => void
  onToggleAttach: () => void
  attachAvailable: boolean
}) {
  const pill = (key: PaneKey, label: string, icon: string, onClick: () => void) => {
    const visible = !panesHidden[key]
    return (
      <button
        className={`bc-pane-toggle ${visible ? 'bc-pane-toggle-on' : ''}`}
        onClick={onClick}
        title={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-pressed={visible}
        aria-label={label}
      ><span className="bc-pane-toggle-icon" aria-hidden="true">{icon}</span></button>
    )
  }
  return (
    <div className="bc-pane-toggles" role="group" aria-label="Pane visibility">
      {pill('turns', 'Turns', '📋', onToggleTurns)}
      {pill('thread', 'Thread', '💬', onToggleThread)}
      {pill('timeline', 'Timeline', '⏱', onToggleTimeline)}
      {pill('git', 'Git', '🌿', onToggleGit)}
      {pill('kanban', 'Kanban', '🗂', onToggleKanban)}
      {attachAvailable && pill('attach', 'Terminal', '⌨', onToggleAttach)}
    </div>
  )
}
