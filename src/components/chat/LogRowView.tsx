import { useMemo, useState } from 'react'
import type { LogRow, TokenUsage } from '../../types'
import { ToolsSection } from '../tools'
import { MessageStats } from './MessageStats'
import { UsageLine } from './UsageLine'
import { formatHMS, groupEventsByType, idTail, shouldExpandByDefault } from './utils'
import type { TurnBlock } from './types'

export function LogRowView({ row, agent }: { row: LogRow; agent: string }) {
  const actorLabel = row.actor === 'user' ? 'You' : row.actor === 'system' ? 'system' : agent
  const typeLabel = row.subtype ? `${row.kind}.${row.subtype}` : row.kind
  const hasStructuredBody = !!(row.text || row.thinking || (row.tools && row.tools.length > 0)
    || row.usage || row.meta || row.systemMessage || row.systemFields
    || row.stateTransition || row.sessionInfo || row.errorMessage)
  const hasRaw = !!(row.events && row.events.length > 0)
  const canExpand = hasStructuredBody || hasRaw

  const [collapsed, setCollapsed] = useState<boolean>(() => !shouldExpandByDefault(row))
  const [showRaw, setShowRaw] = useState<boolean>(() => !hasStructuredBody && hasRaw)

  return (
    <div className={`bc-row bc-row-${row.actor}`}>
      <div className="bc-row-header" onClick={() => canExpand && setCollapsed(c => !c)}>
        <span className="bc-row-ts">{formatHMS(row.timestamp)}</span>
        <span className="bc-row-type">{typeLabel}</span>
        <span className="bc-row-actor">{actorLabel}</span>
        <span className="bc-row-ids">
          {row.clientId && <code title="client id" className="bc-row-id bc-row-id-cli">cli:{idTail(row.clientId)}</code>}
          {row.clientRequestId && <code title="caller's per-turn request id" className="bc-row-id bc-row-id-req">req:{idTail(row.clientRequestId)}</code>}
          {row.turnId && <code title="bridge-server turn_id" className="bc-row-id bc-row-id-turn">turn:{idTail(row.turnId)}</code>}
          {row.messageId && <code title="bridge-server message_id" className="bc-row-id bc-row-id-srv">srv:{idTail(row.messageId)}</code>}
          {row.harnessMessageId && <code title="harness completion id" className="bc-row-id bc-row-id-hid">hid:{idTail(row.harnessMessageId)}</code>}
          {row.toolUseId && <code title="harness tool_use id" className="bc-row-id bc-row-id-tu">tu:{idTail(row.toolUseId)}</code>}
        </span>
        {canExpand && <span className="bc-row-collapse">{collapsed ? '▸' : '▾'}</span>}
      </div>
      {!collapsed && (
        <div className="bc-row-body">
          {row.text && <div className="bc-row-text">{row.text}</div>}
          {row.thinking && (
            <details className="bc-row-thinking">
              <summary>thinking</summary>
              <div className="bc-row-thinking-text">{row.thinking}</div>
            </details>
          )}
          {row.tools && row.tools.length > 0 && (
            <ToolsSection tools={row.tools} turnDone={!!row.done} />
          )}
          {row.usage && <UsageLine usage={row.usage} />}
          {row.meta && <MessageStats meta={row.meta} />}
          {row.systemMessage && <div className="bc-row-system">{row.systemMessage}</div>}
          {row.systemFields && (
            <pre className="bc-row-json">{JSON.stringify(row.systemFields, null, 2)}</pre>
          )}
          {row.stateTransition && (
            <div className="bc-row-state">
              {row.stateTransition.from ?? '—'} → <strong>{row.stateTransition.to}</strong>
              {row.stateTransition.reason ? ` (${row.stateTransition.reason})` : ''}
            </div>
          )}
          {row.sessionInfo && (
            <details className="bc-row-info">
              <summary>session info</summary>
              <pre className="bc-row-json">{JSON.stringify(row.sessionInfo, null, 2)}</pre>
            </details>
          )}
          {row.errorMessage && <div className="bc-row-error">{row.errorMessage}</div>}
          {hasRaw && (
            <div className="bc-row-raw-wrap">
              <button className="bc-row-raw-toggle" onClick={e => { e.stopPropagation(); setShowRaw(s => !s) }}>
                {showRaw ? 'hide raw' : `raw (${row.events.length})`}
              </button>
              {showRaw && (
                <div className="bc-row-raw-groups">
                  {groupEventsByType(row.events).map(g => (
                    <details key={g.type} className="bc-row-raw-group">
                      <summary>{g.type} ({g.events.length})</summary>
                      <pre className="bc-row-json">{JSON.stringify(g.events, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function groupRowsByTurn(rows: LogRow[]): TurnBlock[] {
  const out: TurnBlock[] = []
  let current: { kind: 'turn'; turnId: string; rows: LogRow[] } | null = null
  for (const r of rows) {
    if (r.turnId) {
      if (current && current.turnId === r.turnId) {
        current.rows.push(r)
      } else {
        if (current) out.push(current)
        current = { kind: 'turn', turnId: r.turnId, rows: [r] }
      }
    } else {
      if (current) { out.push(current); current = null }
      out.push({ kind: 'standalone', row: r })
    }
  }
  if (current) out.push(current)
  return out
}

function turnSummary(rows: LogRow[]): { userText?: string; toolCount: number; done: boolean; errored: boolean; totalUsage?: TokenUsage } {
  let userText: string | undefined
  let toolCount = 0
  let done = false
  let errored = false
  let totalUsage: TokenUsage | undefined
  for (const r of rows) {
    if (r.actor === 'user' && !userText && r.text) userText = r.text
    if (r.tools) toolCount += r.tools.length
    if (r.eventType === 'result' && r.done) { done = true; totalUsage = r.usage ?? r.meta?.usage ?? totalUsage }
    if (r.errorMessage) { errored = true; done = true }
  }
  return { userText, toolCount, done, errored, totalUsage }
}

export function TurnGroupView({ turnId, rows, agent }: { turnId: string; rows: LogRow[]; agent: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const summary = useMemo(() => turnSummary(rows), [rows])
  const snippet = summary.userText
    ? (summary.userText.length > 80 ? summary.userText.slice(0, 80) + '…' : summary.userText)
    : '(no user text)'

  return (
    <div className={`bc-turn${summary.errored ? ' bc-turn-error' : summary.done ? ' bc-turn-done' : ' bc-turn-live'}`}>
      <div className="bc-turn-header" onClick={() => setCollapsed(c => !c)}>
        <span className="bc-turn-chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="bc-turn-label">Turn</span>
        <code className="bc-row-id bc-row-id-turn" title="bridge-server turn_id">turn:{idTail(turnId)}</code>
        <span className="bc-turn-snippet">{snippet}</span>
        <span className="bc-turn-spacer" />
        <span className="bc-turn-count">{rows.length} event{rows.length === 1 ? '' : 's'}</span>
        {summary.toolCount > 0 && <span className="bc-turn-tools">{summary.toolCount} tool{summary.toolCount === 1 ? '' : 's'}</span>}
        {summary.totalUsage && <UsageLine usage={summary.totalUsage} />}
        {!summary.done && <span className="bc-turn-running"><span className="bc-pulse" /> running</span>}
      </div>
      {!collapsed && (
        <div className="bc-turn-body">
          {rows.map(row => <LogRowView key={row.key} row={row} agent={agent} />)}
        </div>
      )}
    </div>
  )
}
