import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useBridgeConfig } from '../context'
import { formatCost } from '../utils'

// What the Orchestrator page (`BridgeOrchestrator`) and the Orchestrator thread in
// the chat (`chat/OrchestratorThread`) both read from the producer: the fetch
// helpers, the conversation and its send, the cost windows. One copy, so the two
// surfaces cannot disagree about what a send does or what the week has cost.

/** Reads a producer response, or throws with the status. Every panel surfaces
 *  what this throws — an orchestrator view that quietly shows stale numbers when
 *  the producer is down is worse than one that says so. */
export async function producerJSON<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** The producer's own polling cadence for the read-only panels. */
const REFRESH_MS = 20000

/** Poll one producer endpoint, keeping whatever it last answered and the reason
 *  the latest attempt failed. Both, deliberately: a failed refresh must not blank
 *  a panel that is still showing the last good answer, and it must not be
 *  invisible either. `refreshSignal` re-reads at once when it changes, so a
 *  panel can follow a run that just finished instead of waiting for the timer. */
export function useProducerResource<T>(
  path: string,
  initial: T,
  refreshSignal: unknown = null,
): { data: T; error: string | null } {
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
  }, [load, refreshSignal])

  return { data, error }
}

// --- the conversation (each send is one POST /run) ---------------------------

export interface ProducerMessage {
  id: string
  role: string
  content: string
  tokens: number
  at: string
}

export interface ProducerConversation {
  messages: ProducerMessage[]
  running: boolean
  /** Why the last read or send failed, verbatim from the producer — the weekly
   *  limit refusal among them. */
  error: string | null
  /** Counts finished sends, so a panel that shows the week's spend or the runs
   *  log can re-read the moment a run lands. */
  completedSends: number
  send: (message: string) => Promise<void>
}

export function useProducerConversation(): ProducerConversation {
  const { fetch: apiFetch, producerBasePath } = useBridgeConfig()
  const [messages, setMessages] = useState<ProducerMessage[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completedSends, setCompletedSends] = useState(0)

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

  const send = useCallback(
    async (message: string) => {
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
        setCompletedSends((n) => n + 1)
        void load()
      }
    },
    [apiFetch, producerBasePath, load],
  )

  return { messages, running, error, completedSends, send }
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

export function CostHeader({ refreshSignal = null }: { refreshSignal?: unknown } = {}): JSX.Element | null {
  const { data, error } = useProducerResource<CostWindows | null>('/cost', null, refreshSignal)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
    <span ref={ref} className="bc-orchestrator-cost" style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...pill, color: over ? '#ef4444' : 'inherit' }}>
        week {formatCost(week)} / {data.week_limit_usd > 0 ? formatCost(data.week_limit_usd) : 'no limit'} · {windows.week?.runs ?? 0} runs ▾
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

const pill: React.CSSProperties = { padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border,#334155)', background: 'var(--bg-surface)', color: 'inherit', cursor: 'pointer', fontSize: 13 }
const dropdown: React.CSSProperties = { position: 'absolute', right: 0, top: '110%', zIndex: 10, background: 'var(--bg,#0f172a)', border: '1px solid var(--border,#334155)', borderRadius: 8, padding: 8, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }
