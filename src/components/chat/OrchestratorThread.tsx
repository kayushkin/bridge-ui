import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useBridgeConfig } from '../../context'
import { formatCost } from '../../utils'
import { CostHeader, useProducerConversation, useProducerResource } from '../orchestratorShared'
import { OrchestratorPanel } from './OrchestratorPanel'
import { ProducerMarkdown, ProducerTextWithReferenceChips } from './producerReferences'
import { StatusDot } from './StatusDot'

// The Orchestrator, opened in the chat's workspace the way a session is — header,
// turns, composer — in place of the thread pane, as the signals page is. It is
// still not a bridge session: the producer keeps the conversation (`/convo`) and
// each send is one `POST /run`, gated by the weekly limit, so there is no
// streaming and no tool calls to show. The reply lands when the run finishes.
//
// What a session thread does not have, it carries in the header: the week's
// spend against the limit, the last run's model and cost, and a Context pane —
// what the next run will be handed. The full page (`routes.orchestrator`) keeps
// the runs log.
//
// It draws with the thread's own classes (`bc-workspace`, `bc-header`,
// `bc-turns-*`, `bc-composer`) so it reads as one of the sessions, and ships no CSS.

interface ProducerRunSummary {
  id: string
  model: string
  cost_usd: number
  duration_ms: number
  error?: string
}

export interface OrchestratorThreadProps {
  onClose: () => void
}

export function OrchestratorThread({ onClose }: OrchestratorThreadProps): JSX.Element {
  const { routes } = useBridgeConfig()
  const { messages, running, error, completedSends, send } = useProducerConversation()
  const { data: lastRuns } = useProducerResource<ProducerRunSummary[]>('/runs?limit=1', [], completedSends)
  const lastRun = lastRuns[0]
  const [contextOpen, setContextOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [messages, running])

  const submit = () => {
    const message = draft.trim()
    if (!message || running) return
    setDraft('')
    void send(message)
  }

  return (
    <div className="bc-workspace bc-workspace-focused bc-orchestrator-thread">
      <div className="bc-header">
        <div className="bc-header-row" style={headerRow}>
          <StatusDot
            state={running ? 'model_generating' : error ? 'error' : 'idle'}
            title={running ? 'Running' : error ? error : 'Idle — each send is one run'}
          />
          <span aria-hidden>🎬</span>
          <span className="bc-session-name" style={{ fontWeight: 600 }}>Orchestrator</span>
          {lastRun && (
            <span style={muted} title="The last run's model, cost and duration">
              {lastRun.model} · last run {formatCost(lastRun.cost_usd)} · {(lastRun.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <CostHeader refreshSignal={completedSends} />
            <button
              style={iconButton}
              aria-pressed={contextOpen}
              onClick={() => setContextOpen((open) => !open)}
              title={`${contextOpen ? 'Hide' : 'Show'} the context the next run will be handed`}
            >
              Context
            </button>
            {routes.orchestrator && (
              <a style={iconButton} href={routes.orchestrator} title="The full Orchestrator page, with every run">
                Runs ↗
              </a>
            )}
            <button style={iconButton} onClick={onClose} aria-label="Close the Orchestrator" title="Close the Orchestrator">
              ✕
            </button>
          </span>
        </div>
      </div>

      <div className="bc-chat-split">
        <div className="bc-turns-pane" data-pane="turns" style={{ flex: '1 1 0' }}>
          <div className="bc-turns-body" style={{ overflowY: 'auto' }}>
            {messages.length === 0 && !running && (
              <div className="bc-turns-empty">No conversation yet — ask the orchestrator something.</div>
            )}
            {messages.map((m, i) => (
              <div
                key={m.id + i}
                className={`bc-turns-item ${m.role === 'user' ? 'bc-turns-user' : 'bc-turns-assistant'}`}
              >
                <div className="bc-turns-meta">
                  <span className="bc-turns-actor">{m.role === 'user' ? 'You' : 'Orchestrator'}</span>
                  {m.at && <span className="bc-turns-ts">{new Date(m.at).toLocaleTimeString()}</span>}
                </div>
                {/* A prompt is echoed back as written, never re-read as markdown — the
                    rule the chat follows for user turns — but keeps its chips, because a
                    scheduled tick's prompt names sessions and todos too. */}
                <div className="bc-turns-text">
                  {m.role === 'user' ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      <ProducerTextWithReferenceChips text={m.content} />
                    </div>
                  ) : (
                    <ProducerMarkdown text={m.content} expandSessionsWithOpenQuestions />
                  )}
                </div>
              </div>
            ))}
            {running && (
              <div className="bc-turns-item bc-turns-assistant">
                <div className="bc-turns-meta">
                  <span className="bc-turns-actor">Orchestrator</span>
                  <span className="bc-turns-streaming-tag">running…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
        {contextOpen && <OrchestratorPanel onToggleCollapse={() => setContextOpen(false)} style={{ flex: '1 1 0' }} />}
      </div>

      {error && (
        <div className="bc-orchestrator-thread-error" style={errorLine}>
          {error}
        </div>
      )}
      <div className="bc-composer">
        <textarea
          className="bc-composer-input"
          value={draft}
          disabled={running}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask the orchestrator… (Enter to send; each send is one run)"
          rows={2}
        />
        <div className="bc-composer-actions">
          <button className="bc-composer-btn" onClick={submit} disabled={running || !draft.trim()}>
            {running ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

const headerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const muted: React.CSSProperties = { fontSize: 12, opacity: 0.6 }
const iconButton: React.CSSProperties = { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border,#334155)', background: 'var(--bg-surface)', color: 'inherit', cursor: 'pointer', fontSize: 12, textDecoration: 'none' }
const errorLine: React.CSSProperties = { color: '#ef4444', fontSize: 12, padding: '4px 12px' }
