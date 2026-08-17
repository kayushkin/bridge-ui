import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useBridgeConfig } from '../context'
import { formatCost } from '../utils'
import { ProducerMarkdown, ProducerTextWithReferenceChips } from './chat/producerReferences'

// The orchestrator's dedicated page. It is NOT a chat session — the producer is
// a stateless-per-run runtime — so this is purpose-built rather than another
// mounting of the chat surface: a conversation you drive (each send is one
// `POST /run`), the runs log, the cost windows, and the injected-context
// inspector. No git/kanban/terminal/repo/compact panes; cost is per-run and
// additive, not an accumulating session.
//
// Ported here from dash's own `pages/Orchestrator.tsx`, which is now a thin
// mount of this component. It was the last surface with a hand-rolled
// `\[(session|task|todo):([^\]]+)\]` matcher and three hardcoded paths
// (`/?session=`, `/kanban`, `/notes`) — both of which are gone: references go
// through chat-core's chips (`./chat/producerReferences`) and every navigation
// target comes from `routes`.
//
// ⚠️ Mount inside chat-core's `<ChatProvider>`. The reference chips resolve
// their ids against llm-bridge and noteboard through its context, and chat-core
// hooks throw without it. `BridgeProvider` is required too, for
// `producerBasePath` and `routes`.

export interface BridgeOrchestratorProps {
  /**
   * Render a referenced session that is waiting on an OPEN QUESTION as an
   * already-expanded inline card, rather than as a collapsed chip somebody has
   * to click. Default true: this page exists to show what the fleet is blocked
   * on, and a blocked session is the thing it is most worth being blocked on.
   *
   * A host that would rather have a quiet page of uniform chips — or that has
   * no signals route to read — passes false, and every reference stays a chip.
   */
  expandSessionsWithOpenQuestions?: boolean
}

/** Reads a producer response, or throws with the status. Every panel below
 *  surfaces what this throws — an orchestrator page that quietly shows stale
 *  numbers when the producer is down is worse than one that says so. */
async function producerJSON<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function BridgeOrchestrator({
  expandSessionsWithOpenQuestions = true,
}: BridgeOrchestratorProps = {}): JSX.Element {
  const { producerBasePath } = useBridgeConfig()

  if (!producerBasePath) {
    return (
      <div className="bc-orchestrator" style={page}>
        <h1 style={{ margin: 0 }}>🎬 Orchestrator</h1>
        <p style={{ opacity: 0.7 }}>
          No producer configured — set <code>producerBasePath</code> on BridgeProvider.
        </p>
      </div>
    )
  }

  return (
    <div className="bc-orchestrator" style={page}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🎬 Orchestrator</h1>
        <span style={{ fontSize: 13, opacity: 0.7 }}>
          a stateless-per-run session manager — not a chat session
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <CostHeader />
        </span>
      </div>
      <Conversation expandSessionsWithOpenQuestions={expandSessionsWithOpenQuestions} />
      <Runs expandSessionsWithOpenQuestions={expandSessionsWithOpenQuestions} />
      <ContextInspector />
    </div>
  )
}

/** The producer's own polling cadence for the read-only panels. */
const REFRESH_MS = 20000

/** Poll one producer endpoint, keeping whatever it last answered and the reason
 *  the latest attempt failed. Both, deliberately: a failed refresh must not blank
 *  a panel that is still showing the last good answer, and it must not be
 *  invisible either. */
function useProducerResource<T>(path: string, initial: T): { data: T; error: string | null } {
  const { fetch: apiFetch, producerBasePath } = useBridgeConfig()
  const [data, setData] = useState<T>(initial)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!producerBasePath) return
    try {
      setData(await producerJSON<T>(await apiFetch(`${producerBasePath}${path}`)))
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    }
  }, [apiFetch, producerBasePath, path])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  return { data, error }
}

// --- cost windows (this week vs limit, dropdown for 24h / 7d / lifetime) -----

interface CostWindow {
  cost_usd: number
  runs: number
}
interface CostWindows {
  windows: Record<string, CostWindow>
  week_limit_usd: number
}

function CostHeader(): JSX.Element | null {
  const { data, error } = useProducerResource<CostWindows | null>('/cost', null)
  const [open, setOpen] = useState(false)

  if (error && !data) return <span style={{ color: '#ef4444', fontSize: 12 }}>cost: {error}</span>
  if (!data) return null

  const windows = data.windows
  const week = windows.week?.cost_usd ?? 0
  const over = data.week_limit_usd > 0 && week >= data.week_limit_usd
  const rows: Array<[string, CostWindow | undefined]> = [
    ['this week', windows.week],
    ['last 24h', windows.last_24h],
    ['last 7 days', windows.last_7d],
    ['lifetime', windows.lifetime],
  ]

  return (
    <span className="bc-orchestrator-cost" style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...pill, color: over ? '#ef4444' : 'inherit' }}>
        week {formatCost(week)} / {formatCost(data.week_limit_usd)} · {windows.week?.runs ?? 0} runs ▾
      </button>
      {open && (
        <div style={dropdown}>
          {rows.map(([label, costWindow]) => (
            <div key={label} style={{ display: 'flex', gap: 16, padding: '3px 4px', fontSize: 13 }}>
              <span style={{ opacity: 0.7, minWidth: 90 }}>{label}</span>
              <span style={{ marginLeft: 'auto' }}>{formatCost(costWindow?.cost_usd ?? 0)}</span>
              <span style={{ opacity: 0.5, minWidth: 48, textAlign: 'right' }}>{costWindow?.runs ?? 0} runs</span>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

// --- conversation + composer (each send is one /run) ------------------------

interface ProducerMessage {
  id: string
  role: string
  content: string
  tokens: number
  at: string
}

function Conversation({
  expandSessionsWithOpenQuestions,
}: {
  expandSessionsWithOpenQuestions: boolean
}): JSX.Element {
  const { fetch: apiFetch, producerBasePath } = useBridgeConfig()
  const [messages, setMessages] = useState<ProducerMessage[]>([])
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setMessages(await producerJSON<ProducerMessage[]>(await apiFetch(`${producerBasePath}/convo`)))
    } catch (e) {
      setError(messageOf(e))
    }
  }, [apiFetch, producerBasePath])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [messages])

  const send = async () => {
    const message = draft.trim()
    if (!message || running) return
    setDraft('')
    setRunning(true)
    setError(null)
    // Optimistic echo of what was just sent, replaced by the server's own copy
    // when the run finishes and /convo is re-read.
    setMessages((m) => [...m, { id: 'pending', role: 'user', content: message, tokens: 0, at: '' }])
    try {
      const response = await apiFetch(`${producerBasePath}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, trigger: 'user' }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `HTTP ${response.status}`)
      }
      await response.json()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setRunning(false)
      void load()
    }
  }

  return (
    <section className="bc-orchestrator-conversation" style={card}>
      <div style={cardHeader}>
        Conversation <span style={{ opacity: 0.5, fontWeight: 400 }}>· each send is one run</span>
      </div>
      <div
        style={{
          maxHeight: 380,
          overflow: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {messages.length === 0 && (
          <div style={{ opacity: 0.5, fontSize: 13 }}>No conversation yet — ask the orchestrator something.</div>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id + i}
            className="bc-orchestrator-message"
            data-role={m.role}
            style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}
          >
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 2 }}>{m.role}</div>
            <div
              style={{
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                color: m.role === 'user' ? 'var(--accent-on,#fff)' : 'inherit',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                padding: '8px 11px',
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {/* A prompt is echoed back exactly as it was written — verbatim,
                  never re-interpreted as markdown, the same rule the chat
                  surfaces follow for user turns. It still gets chips, because a
                  trigger-injected prompt names sessions and todos too, and
                  losing those would be losing the reader's way into them.
                  Nothing there is expanded: an open question is something the
                  PRODUCER is reporting, not something the user asked. */}
              {m.role === 'user' ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  <ProducerTextWithReferenceChips text={m.content} />
                </div>
              ) : (
                <ProducerMarkdown
                  text={m.content}
                  expandSessionsWithOpenQuestions={expandSessionsWithOpenQuestions}
                />
              )}
            </div>
          </div>
        ))}
        {running && <div style={{ opacity: 0.6, fontSize: 13 }}>orchestrator running…</div>}
        <div ref={endRef} />
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '0 12px 6px' }}>{error}</div>}
      <div className="bc-composer" style={{ margin: 12 }}>
        <textarea
          className="bc-composer-input"
          value={draft}
          disabled={running}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Ask the orchestrator… (Enter to send)"
          rows={2}
        />
        <div className="bc-composer-actions">
          <button className="bc-composer-btn" onClick={() => void send()} disabled={running || !draft.trim()}>
            {running ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  )
}

// --- runs log ---------------------------------------------------------------

interface ProducerRun {
  id: string
  at: string
  trigger: string
  model: string
  message: string
  reply: string
  injected_tokens: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  error?: string
}

function Runs({
  expandSessionsWithOpenQuestions,
}: {
  expandSessionsWithOpenQuestions: boolean
}): JSX.Element {
  const { data: runs, error } = useProducerResource<ProducerRun[]>('/runs?limit=50', [])
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="bc-orchestrator-runs" style={card}>
      <div style={cardHeader}>
        Runs <span style={{ opacity: 0.5, fontWeight: 400 }}>· {runs.length}</span>
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '6px 12px' }}>{error}</div>}
      {runs.length === 0 && !error && <div style={{ opacity: 0.5, fontSize: 13, padding: 12 }}>No runs yet.</div>}
      {runs.map((r) => (
        <div key={r.id} style={{ borderTop: '1px solid var(--border,#1e293b)' }}>
          <div
            onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
            style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 12px', cursor: 'pointer', fontSize: 12 }}
          >
            <span style={{ opacity: 0.6, minWidth: 120 }}>{r.at ? new Date(r.at).toLocaleString() : ''}</span>
            <span style={{ ...tag, background: 'rgba(99,102,241,0.18)' }}>{r.trigger}</span>
            <span style={{ opacity: 0.75, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.error ? <span style={{ color: '#ef4444' }}>error: {r.error}</span> : r.message}
            </span>
            <span title="injected context">inj {r.injected_tokens}</span>
            <span title="output tokens">out {r.output_tokens}</span>
            <span style={{ minWidth: 52, textAlign: 'right' }}>{formatCost(r.cost_usd)}</span>
          </div>
          {open === r.id && !r.error && (
            <div style={{ padding: '0 12px 10px', fontSize: 12 }}>
              <div style={{ opacity: 0.6, margin: '4px 0' }}>you: {r.message}</div>
              <ProducerMarkdown
                text={r.reply}
                expandSessionsWithOpenQuestions={expandSessionsWithOpenQuestions}
              />
              <div style={{ opacity: 0.5, marginTop: 6 }}>
                {r.model} · {r.input_tokens} in / {r.output_tokens} out · {(r.duration_ms / 1000).toFixed(1)}s
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

// --- context inspector (the parts the next run would be handed) -------------

interface ContextVersion {
  part: string
  title: string
  content: string
  tokens: number
}
interface ContextPart {
  part: string
  title: string
  latest: ContextVersion
  version_count: number
}

const ORDER = ['agents', 'tasks', 'convo_summary', 'convo_current']

function ContextInspector(): JSX.Element {
  const { data: parts, error } = useProducerResource<ContextPart[]>('/context', [])
  // Which parts are unfolded, so a folded one renders no body at all. A
  // `<details>` keeps its children in the DOM while closed, and each reference
  // in there is a chip that resolves its id the moment it mounts — a folded
  // dump naming forty sessions would put forty requests on the wire for
  // something nobody has looked at yet. `agents` starts open, as it always did.
  const [openParts, setOpenParts] = useState<ReadonlySet<string>>(() => new Set(['agents']))
  const setPartOpen = (part: string, open: boolean) =>
    setOpenParts((previous) => {
      const next = new Set(previous)
      if (open) next.add(part)
      else next.delete(part)
      return next
    })
  const ordered = [
    ...(ORDER.map((id) => parts.find((p) => p.part === id)).filter(Boolean) as ContextPart[]),
    ...parts.filter((p) => !ORDER.includes(p.part)),
  ]
  const total = ordered.reduce((a, p) => a + (p.latest?.tokens ?? 0), 0)

  return (
    <section className="bc-orchestrator-context" style={card}>
      <div style={cardHeader}>
        Injected context <span style={{ opacity: 0.5, fontWeight: 400 }}>· ~{total.toLocaleString()} tok</span>
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '6px 12px' }}>{error}</div>}
      {ordered.map((p) => (
        <details
          key={p.part}
          open={openParts.has(p.part)}
          onToggle={(e) => setPartOpen(p.part, (e.currentTarget as HTMLDetailsElement).open)}
          style={{ borderTop: '1px solid var(--border,#1e293b)' }}
        >
          <summary style={{ cursor: 'pointer', padding: '7px 12px', fontSize: 13 }}>
            {p.title}{' '}
            <span style={{ opacity: 0.5 }}>
              · ~{p.latest.tokens.toLocaleString()} tok · v{p.version_count}
            </span>
          </summary>
          {/* The dump is a payload, not prose — it is what the model will be
              handed — so it keeps its own whitespace and is never expanded
              inline: a context part naming twenty sessions would otherwise
              unfold twenty cards inside a preformatted block. */}
          {openParts.has(p.part) && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 11.5,
                margin: 0,
                padding: '0 12px 10px',
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
              <ProducerTextWithReferenceChips text={p.latest.content} />
            </pre>
          )}
        </details>
      ))}
    </section>
  )
}

// --- shared inline styles ---------------------------------------------------
// Carried over from the page this was ported from, so a host that mounts it
// gets the surface it already had without shipping any new CSS. The class names
// above are the themeable surface.

const page: React.CSSProperties = { padding: 20, maxWidth: 960, margin: '0 auto', color: 'var(--text,#e2e8f0)' }
const card: React.CSSProperties = { border: '1px solid var(--border,#334155)', borderRadius: 10, marginTop: 16, overflow: 'hidden' }
const cardHeader: React.CSSProperties = { padding: '9px 12px', background: 'var(--bg-surface)', fontWeight: 600, fontSize: 14 }
const pill: React.CSSProperties = { padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border,#334155)', background: 'var(--bg-surface)', color: 'inherit', cursor: 'pointer', fontSize: 13 }
const dropdown: React.CSSProperties = { position: 'absolute', right: 0, top: '110%', zIndex: 10, background: 'var(--bg,#0f172a)', border: '1px solid var(--border,#334155)', borderRadius: 8, padding: 8, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }
const tag: React.CSSProperties = { fontSize: 10, padding: '1px 6px', borderRadius: 4 }
