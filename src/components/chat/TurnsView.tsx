import { useCallback, useMemo } from 'react'
import type { LogRow } from '../../types'
import { useStickyBottomScroll } from '../../useStickyBottomScroll'
import { UsageLine } from './UsageLine'
import { formatHMS } from './utils'
import type { TurnsItem } from './types'

function rowsToTurns(rows: LogRow[]): TurnsItem[] {
  // Within one assistant turn, the harness can emit several text blocks
  // separated by tool calls (e.g. "Let me check…" → tool → "Found it…" →
  // tool → "Done."). Each block is its own message_id, but they all share
  // a turn_id. Merge them into a single Turns item so the user sees one
  // assistant response per turn.
  //
  // Per-message dedup (text vs result) is preserved: while a message is
  // streaming we use its `text` row; once `result` lands we prefer the
  // result text for that message_id.

  // turnId -> set of message_ids that have a closed `result` row.
  const turnResultMsgIds = new Map<string, Set<string>>()
  for (const r of rows) {
    if (r.kind === 'result' && r.done && r.messageId && r.turnId) {
      let s = turnResultMsgIds.get(r.turnId)
      if (!s) { s = new Set(); turnResultMsgIds.set(r.turnId, s) }
      s.add(r.messageId)
    }
  }

  const out: TurnsItem[] = []
  const emittedTurns = new Set<string>()

  for (const row of rows) {
    if (row.kind === 'user_message' && row.text) {
      out.push({
        key: `tv_user_${row.key}`,
        actor: 'user',
        text: row.text,
        ts: row.timestamp,
        turnId: row.turnId,
      })
      continue
    }

    if (row.kind === 'system' && row.subtype === 'compact_boundary') {
      out.push({
        key: `tv_compact_${row.key}`,
        actor: 'system',
        text: 'Context compacted',
        ts: row.timestamp,
        isMarker: true,
        markerKind: 'compact',
      })
      continue
    }

    const isAssistantContent = row.kind === 'text' || row.kind === 'result' || row.kind === 'error'
    if (!isAssistantContent) continue

    if (row.turnId) {
      if (emittedTurns.has(row.turnId)) continue
      emittedTurns.add(row.turnId)

      const dedup = turnResultMsgIds.get(row.turnId) ?? new Set<string>()
      const parts: string[] = []
      let hasError = false
      let isStreaming = false
      let lastUsage: LogRow['usage']

      for (const r of rows) {
        if (r.turnId !== row.turnId) continue
        if (r.kind === 'result' && r.done) {
          const t = r.text || r.meta?.text
          if (t) parts.push(t)
          if (r.usage || r.meta?.usage) lastUsage = r.usage || r.meta?.usage
          if (r.meta?.is_error) hasError = true
        } else if (r.kind === 'text' && r.text && !(r.messageId && dedup.has(r.messageId))) {
          parts.push(r.text)
          isStreaming = true
        } else if (r.kind === 'error' && r.errorMessage) {
          parts.push(r.errorMessage)
          hasError = true
        }
      }

      const merged = parts.filter(Boolean).join('\n\n')
      if (merged) {
        out.push({
          key: `tv_turn_${row.turnId}`,
          actor: 'assistant',
          text: merged,
          ts: row.timestamp,
          turnId: row.turnId,
          usage: lastUsage,
          isError: hasError,
          isStreaming,
        })
      }
      continue
    }

    // No turnId — fall back to per-row emission (rare; old harnesses).
    if (row.kind === 'result' && row.done) {
      const text = row.text || row.meta?.text
      if (text) {
        out.push({
          key: `tv_res_${row.key}`,
          actor: 'assistant',
          text,
          ts: row.timestamp,
          usage: row.usage || row.meta?.usage,
          isError: row.meta?.is_error,
        })
      }
    } else if (row.kind === 'text' && row.text) {
      out.push({
        key: `tv_txt_${row.key}`,
        actor: 'assistant',
        text: row.text,
        ts: row.timestamp,
        isStreaming: true,
      })
    } else if (row.kind === 'error' && row.errorMessage) {
      out.push({
        key: `tv_err_${row.key}`,
        actor: 'assistant',
        text: row.errorMessage,
        ts: row.timestamp,
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
  const { containerRef, endRef, isAtBottom, scrollToBottom } = useStickyBottomScroll<HTMLDivElement>()
  const items = useMemo(() => rowsToTurns(rows), [rows])

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
        {items.map(it => {
          if (it.isMarker) {
            return (
              <div key={it.key} className={`bc-turns-marker bc-turns-marker-${it.markerKind}`} role="separator">
                <span className="bc-turns-marker-line" aria-hidden />
                <span className="bc-turns-marker-text">{it.text}</span>
                <span className="bc-turns-marker-ts">{formatHMS(it.ts)}</span>
                <span className="bc-turns-marker-line" aria-hidden />
              </div>
            )
          }
          return (
            <div
              key={it.key}
              className={`bc-turns-item bc-turns-${it.actor}${it.isError ? ' bc-turns-error' : ''}${it.isStreaming ? ' bc-turns-streaming' : ''}`}
            >
              <div className="bc-turns-meta">
                <span className="bc-turns-actor">{it.actor === 'user' ? 'You' : agent || 'assistant'}</span>
                <span className="bc-turns-ts">{formatHMS(it.ts)}</span>
                {it.usage && <UsageLine usage={it.usage} />}
                {it.isStreaming && <span className="bc-turns-streaming-tag">streaming…</span>}
              </div>
              <div className="bc-turns-text">{it.text}</div>
            </div>
          )
        })}
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
