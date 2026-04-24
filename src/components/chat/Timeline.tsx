import { useCallback, useEffect, useMemo } from 'react'
import type { LogRow } from '../../types'
import { useStickyBottomScroll } from '../../useStickyBottomScroll'
import { formatTokens } from '../../utils'
import { formatHMS, oneLine, toolFullText, toolSnippet } from './utils'
import type { TimelineItem } from './types'

function rowsToTimeline(rows: LogRow[]): TimelineItem[] {
  const out: TimelineItem[] = []
  const seenTurn = new Set<string>()
  const taskIdxByScope = new Map<string, number>()
  let currentTurnId: string | undefined
  let currentTaskId: string | undefined

  for (const row of rows) {
    if (row.turnId !== currentTurnId) {
      currentTurnId = row.turnId
      currentTaskId = undefined
      taskIdxByScope.clear()
    }

    if (row.kind === 'user_message') {
      currentTaskId = undefined
      const turnMark = row.turnId && !seenTurn.has(row.turnId)
      if (row.turnId) seenTurn.add(row.turnId)
      out.push({
        key: `tl_turn_${row.key}`,
        turnId: row.turnId,
        icon: turnMark ? '▶' : '»',
        label: 'Turn',
        detail: row.text ? oneLine(row.text) : undefined,
        fullText: row.text,
        ts: row.timestamp,
        tone: 'turn',
      })
      continue
    }

    if (row.kind === 'system' && row.subtype && row.subtype.startsWith('task_')) {
      const raw = (row.events[0] as { raw?: Record<string, unknown> } | undefined)?.raw
      const explicitId = (row.systemFields?.task_id as string | undefined)
        || (typeof raw?.task_id === 'string' ? (raw.task_id as string) : undefined)
      const isStart = row.subtype === 'task_started'
      if (isStart) {
        currentTaskId = explicitId || `task_${row.key}`
      } else if (explicitId && !currentTaskId) {
        currentTaskId = explicitId
      }
      const description = (row.systemFields?.description as string | undefined)
        || (typeof raw?.description === 'string' ? (raw.description as string) : undefined)
      const lastTool = (row.systemFields?.last_tool_name as string | undefined)
        || (typeof raw?.last_tool_name === 'string' ? (raw.last_tool_name as string) : undefined)
      const taskType = typeof raw?.task_type === 'string' ? (raw.task_type as string) : undefined
      const full = description || row.systemMessage || lastTool || taskType || ''

      if (currentTaskId && taskIdxByScope.has(currentTaskId)) {
        const idx = taskIdxByScope.get(currentTaskId)!
        const existing = out[idx]
        if (!existing.detail && full) {
          existing.detail = oneLine(full)
          existing.fullText = full
        }
        continue
      }

      out.push({
        key: `tl_task_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '▣',
        label: 'Task',
        detail: full ? oneLine(full) : undefined,
        fullText: full || undefined,
        ts: row.timestamp,
        tone: 'task-start',
      })
      if (currentTaskId) taskIdxByScope.set(currentTaskId, out.length - 1)
      continue
    }

    if (row.kind === 'thinking' && row.thinking) {
      out.push({
        key: `tl_think_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '💭',
        label: 'Thinking',
        detail: oneLine(row.thinking),
        fullText: row.thinking,
        ts: row.timestamp,
        tone: 'thinking',
      })
      continue
    }

    if (row.kind === 'tool' && row.tools && row.tools.length > 0) {
      for (const t of row.tools) {
        const done = t.output !== undefined
        const err = !!t.error
        out.push({
          key: `tl_tool_${row.key}_${t.tool_id || t.tool}`,
          turnId: row.turnId,
          taskId: currentTaskId,
          icon: err ? '✗' : done ? '✓' : '⚙',
          label: t.tool || 'tool',
          detail: toolSnippet(t),
          fullText: toolFullText(t),
          ts: row.timestamp,
          tone: err ? 'tool-err' : done ? 'tool-done' : 'tool',
        })
      }
      continue
    }

    if (row.kind === 'result' && row.done) {
      currentTaskId = undefined
      const u = row.usage || row.meta?.usage
      let detail: string | undefined
      if (u) {
        const parts: string[] = []
        if (u.input_tokens) parts.push(`in ${formatTokens(u.input_tokens)}`)
        if (u.output_tokens) parts.push(`out ${formatTokens(u.output_tokens)}`)
        detail = parts.join(' · ') || undefined
      }
      out.push({
        key: `tl_res_${row.key}`,
        turnId: row.turnId,
        icon: '■',
        label: 'Done',
        detail,
        fullText: row.text || row.meta?.text,
        ts: row.timestamp,
        tone: 'result',
      })
      continue
    }

    if (row.kind === 'error' || row.errorMessage) {
      out.push({
        key: `tl_err_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '⚠',
        label: 'Error',
        detail: row.errorMessage ? oneLine(row.errorMessage) : undefined,
        fullText: row.errorMessage,
        ts: row.timestamp,
        tone: 'error',
      })
      continue
    }

    if (row.kind === 'text' && row.text) {
      out.push({
        key: `tl_text_${row.key}`,
        turnId: row.turnId,
        taskId: currentTaskId,
        icon: '✎',
        label: 'Text',
        detail: oneLine(row.text),
        fullText: row.text,
        ts: row.timestamp,
        tone: 'text',
      })
      continue
    }
  }
  return out
}

function TimelineItemRow({ item }: { item: TimelineItem }) {
  const tip = item.fullText || item.detail || item.label
  return (
    <div className={`bc-tl-item bc-tl-${item.tone}`} title={tip}>
      <span className="bc-tl-ts">{formatHMS(item.ts)}</span>
      <span className="bc-tl-icon">{item.icon}</span>
      <span className="bc-tl-label">{item.label}</span>
      {item.detail && <span className="bc-tl-detail">{item.detail}</span>}
    </div>
  )
}

function renderTurnChildren(items: TimelineItem[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (!it.taskId) {
      out.push(<TimelineItemRow key={it.key} item={it} />)
      i++
      continue
    }
    const taskId = it.taskId
    const start = i
    while (i < items.length && items[i].taskId === taskId) i++
    const [header, ...rest] = items.slice(start, i)
    out.push(
      <div key={`tk_${taskId}_${start}`} className="bc-tl-task-group">
        <div className="bc-tl-task-header">
          <TimelineItemRow key={header.key} item={header} />
        </div>
        {rest.length > 0 && (
          <div className="bc-tl-task-body">
            {rest.map(t => <TimelineItemRow key={t.key} item={t} />)}
          </div>
        )}
      </div>,
    )
  }
  return out
}

function renderTimelineNodes(items: TimelineItem[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (!it.turnId) {
      out.push(<TimelineItemRow key={it.key} item={it} />)
      i++
      continue
    }
    const turnId = it.turnId
    const start = i
    while (i < items.length && items[i].turnId === turnId) i++
    const [header, ...rest] = items.slice(start, i)
    out.push(
      <div key={`tg_${turnId}_${start}`} className="bc-tl-turn-group">
        <div className="bc-tl-turn-header">
          <TimelineItemRow key={header.key} item={header} />
        </div>
        {rest.length > 0 && (
          <div className="bc-tl-turn-body">
            {renderTurnChildren(rest)}
          </div>
        )}
      </div>,
    )
  }
  return out
}

export function Timeline({ rows, onToggleCollapse, style, paneKey }: {
  rows: LogRow[]
  onToggleCollapse: () => void
  style?: React.CSSProperties
  paneKey?: string
}) {
  const { containerRef, endRef, isAtBottom, scrollToBottom, autoScrollIfAtBottom } = useStickyBottomScroll<HTMLDivElement>()
  const items = useMemo(() => rowsToTimeline(rows), [rows])
  useEffect(() => { autoScrollIfAtBottom() }, [items.length, autoScrollIfAtBottom])

  const onHeaderKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() }
  }, [onToggleCollapse])

  return (
    <div className="bc-timeline" style={style} data-pane={paneKey}>
      <div
        className="bc-timeline-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={onHeaderKey}
        role="button"
        tabIndex={0}
        title="Hide timeline"
        aria-label="Hide timeline"
      >
        <span className="bc-timeline-title">Timeline</span>
        <span className="bc-timeline-count">{items.length}</span>
        <span className="bc-spacer" />
        <span className="bc-timeline-collapse-btn" aria-hidden="true">×</span>
      </div>
      <div ref={containerRef} className="bc-timeline-body">
        {items.length === 0 && <div className="bc-timeline-empty">No events yet</div>}
        {renderTimelineNodes(items)}
        <div ref={endRef} />
      </div>
      {!isAtBottom && (
        <button
          type="button"
          className="bc-jump-latest"
          onClick={() => scrollToBottom()}
          title="Jump to latest"
          aria-label="Jump to latest"
        >↓ New events</button>
      )}
    </div>
  )
}
