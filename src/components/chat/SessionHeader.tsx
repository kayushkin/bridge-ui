import type { LogRow } from '../../types'
import { formatCost, formatTokens } from '../../utils'
import { EditableName } from './EditableName'
import { PaneToggles } from './PaneToggles'
import type { ChatSession, PanesHidden } from './types'

export function SessionHeader({ chat, uiState, activity, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseWorkspace }: {
  chat: ChatSession | null
  uiState: string
  activity: { kind: string; name?: string }
  rows: LogRow[]
  onRename: (name: string) => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  panesHidden: PanesHidden
  onToggleTurns: () => void
  onToggleThread: () => void
  onToggleTimeline: () => void
  onToggleGit: () => void
  onCloseWorkspace?: () => void
}) {
  const completed = chat ? rows.filter(r => r.actor === 'assistant' && r.done && r.meta) : []
  const last = completed[completed.length - 1]
  const meta = last?.meta
  let totalCost = 0
  for (const r of completed) totalCost += r.meta?.cost?.total_usd ?? 0

  const contextTokens = meta?.usage?.context_tokens ?? 0
  const contextLimit = meta?.usage?.context_limit ?? 0
  const contextPct = contextTokens && contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0
  const contextTone = contextPct >= 90 ? 'crit' : contextPct >= 70 ? 'warn' : ''

  const activityText = activity.kind !== 'idle' && uiState === 'running'
    ? (activity.kind === 'tool' ? `${activity.name}` : activity.kind === 'thinking' ? 'thinking' : 'streaming')
    : ''

  const showState = !!chat && uiState !== 'empty'

  return (
    <div className="bc-header">
      <div className="bc-header-row">
        <div className="bc-nav-arrows">
          <button className="bc-nav-arrow" onClick={onPrev} disabled={!hasPrev} title="Previous session" aria-label="Previous session">‹</button>
          <button className="bc-nav-arrow" onClick={onNext} disabled={!hasNext} title="Next session" aria-label="Next session">›</button>
        </div>
        {showState ? (
          <span className={`bc-state-badge bc-state-${uiState}`}>
            {uiState === 'running' && <span className="bc-pulse" />}
            {uiState.charAt(0).toUpperCase() + uiState.slice(1)}
            {activityText && <span className="bc-state-activity">· {activityText}</span>}
          </span>
        ) : (
          <span className="bc-state-badge bc-state-placeholder">No session</span>
        )}
        {chat
          ? <EditableName value={chat.displayName} onSave={onRename} className="bc-session-name" />
          : <span className="bc-session-name bc-session-name-empty">—</span>}
        {contextTokens > 0 && contextLimit > 0 && (
          <span className="bc-context-label" title={`${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens`}>
            {formatTokens(contextTokens)}/{formatTokens(contextLimit)} ({contextPct}%)
          </span>
        )}
        {totalCost > 0 && <span className="bc-cost">{formatCost(totalCost)}</span>}
        <span className="bc-spacer" />
        <PaneToggles
          panesHidden={panesHidden}
          onToggleTurns={onToggleTurns}
          onToggleThread={onToggleThread}
          onToggleTimeline={onToggleTimeline}
          onToggleGit={onToggleGit}
        />
        {onCloseWorkspace && (
          <button
            className="bc-workspace-close"
            onClick={onCloseWorkspace}
            title="Close workspace"
            aria-label="Close workspace"
          >×</button>
        )}
      </div>
      {contextTokens > 0 && contextLimit > 0 && (
        <div
          className={`bc-header-context ${contextTone ? `bc-header-context-${contextTone}` : ''}`}
          style={{ width: `${contextPct}%` }}
        />
      )}
    </div>
  )
}
