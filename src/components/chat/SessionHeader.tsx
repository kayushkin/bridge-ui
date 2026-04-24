import type { LogRow } from '../../types'
import { formatCost, formatTokens } from '../../utils'
import { EditableName } from './EditableName'
import { PaneToggles } from './PaneToggles'
import type { ChatSession, CollapseState } from './types'

export function SessionHeader({ chat, uiState, activity, rows, instance, onRename, onPrev, onNext, hasPrev, hasNext, collapseState, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseAllPanes }: {
  chat: ChatSession | null
  uiState: string
  activity: { kind: string; name?: string }
  rows: LogRow[]
  instance: { name: string; transport: string } | null
  onRename: (name: string) => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  collapseState: CollapseState
  onToggleTurns: () => void
  onToggleThread: () => void
  onToggleTimeline: () => void
  onToggleGit: () => void
  onCloseAllPanes: () => void
}) {
  if (!chat || uiState === 'empty') return null

  const completed = rows.filter(r => r.actor === 'assistant' && r.done && r.meta)
  const last = completed[completed.length - 1]
  const meta = last?.meta
  let totalCost = 0
  for (const r of completed) totalCost += r.meta?.cost?.total_usd ?? 0

  const contextTokens = meta?.usage?.context_tokens ?? 0
  const contextLimit = meta?.usage?.context_limit ?? 0
  const contextPct = contextTokens && contextLimit ? Math.round((contextTokens / contextLimit) * 100) : 0

  const activityText = activity.kind !== 'idle' && uiState === 'running'
    ? (activity.kind === 'tool' ? `${activity.name}` : activity.kind === 'thinking' ? 'thinking' : 'streaming')
    : ''

  return (
    <div className="bc-header">
      <div className="bc-header-row">
        <div className="bc-nav-arrows">
          <button className="bc-nav-arrow" onClick={onPrev} disabled={!hasPrev} title="Previous session" aria-label="Previous session">‹</button>
          <button className="bc-nav-arrow" onClick={onNext} disabled={!hasNext} title="Next session" aria-label="Next session">›</button>
        </div>
        <span className={`bc-state-badge bc-state-${uiState}`}>
          {uiState === 'running' && <span className="bc-pulse" />}
          {uiState.charAt(0).toUpperCase() + uiState.slice(1)}
          {activityText && <span className="bc-state-activity">· {activityText}</span>}
        </span>
        <EditableName value={chat.displayName} onSave={onRename} className="bc-session-name" />
        {meta?.model && <span className="bc-model-badge">{String(meta.model)}</span>}
        {instance && <span className="bc-instance-badge">{instance.name} ({instance.transport})</span>}
        {contextTokens > 0 && contextLimit > 0 && (
          <span className="bc-context-inline" title={`${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens`}>
            <span className="bc-context-label">{formatTokens(contextTokens)}/{formatTokens(contextLimit)} ({contextPct}%)</span>
            <span className="bc-context-bar">
              <span className={`bc-bar-fill ${contextPct >= 90 ? 'bc-bar-crit' : contextPct >= 70 ? 'bc-bar-warn' : ''}`} style={{ width: `${Math.min(100, contextPct)}%` }} />
            </span>
          </span>
        )}
        {totalCost > 0 && <span className="bc-cost">{formatCost(totalCost)}</span>}
        <span className="bc-spacer" />
        <PaneToggles
          collapseState={collapseState}
          onToggleTurns={onToggleTurns}
          onToggleThread={onToggleThread}
          onToggleTimeline={onToggleTimeline}
          onToggleGit={onToggleGit}
          onCloseAll={onCloseAllPanes}
        />
      </div>
    </div>
  )
}
