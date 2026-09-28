import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useOpenSignals } from '@kayushkin/chat-core'
import { useBridgeConfig } from '../../context'
import { conductorCanAnswer, conductorState, conductorStatusText, type ConductorFacts } from '../../conductorState'

// The orchestrator as the conductor at the foot of the sidebar: what it is doing, a
// click to open it, what needs you, and a one-line field to ask it something from any
// chat. A host theme with a character draws it in `.bc-conductor-mascot` by the dock's
// `data-state`; bridge-ui itself shows the 🎬 and a coloured dot.

// How often to ask whether a run is in flight, and how often to re-read the settings
// and the last run. A run takes tens of seconds, so 5s is soon enough to see one start.
const ACTIVE_POLL_MS = 5_000
const SLOW_POLL_MS = 30_000

interface ActiveRuns {
  active: { trigger: string; message: string; started_at: string }[]
}
interface LastRun {
  error?: string
}
interface ProducerSettings {
  enabled: boolean
}
/** What the orchestrator said back to a question asked here, or why it could not. */
type Answer = { kind: 'reply'; text: string } | { kind: 'error'; text: string }

export interface ConductorDockProps {
  /** Open the orchestrator's thread in the workspace. */
  onOpenOrchestrator: () => void
  /** Open every open signal on the thread pane's full width. */
  onOpenSignalsPage: () => void
}

export function ConductorDock({ onOpenOrchestrator, onOpenSignalsPage }: ConductorDockProps) {
  const { fetch: apiFetch, producerBasePath } = useBridgeConfig()
  const { signals } = useOpenSignals()
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [unreachableBecause, setUnreachableBecause] = useState<string | null>(null)
  const [activeRuns, setActiveRuns] = useState(0)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [lastRunError, setLastRunError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)

  const readJSON = useCallback(
    async <T,>(path: string): Promise<T> => {
      const response = await apiFetch(`${producerBasePath}${path}`)
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
      return (await response.json()) as T
    },
    [apiFetch, producerBasePath],
  )

  const pollActive = useCallback(async () => {
    try {
      const { active } = await readJSON<ActiveRuns>('/runs/active')
      setActiveRuns(active.length)
      setReachable(true)
      setUnreachableBecause(null)
    } catch (error) {
      setReachable(false)
      setUnreachableBecause(error instanceof Error ? error.message : String(error))
    }
  }, [readJSON])

  const pollSlow = useCallback(async () => {
    try {
      const [settings, lastRuns] = await Promise.all([
        readJSON<ProducerSettings>('/config'),
        readJSON<LastRun[]>('/runs?limit=1'),
      ])
      setEnabled(settings.enabled)
      setLastRunError(lastRuns[0]?.error ?? null)
    } catch (error) {
      setReachable(false)
      setUnreachableBecause(error instanceof Error ? error.message : String(error))
    }
  }, [readJSON])

  useEffect(() => {
    if (!producerBasePath) return
    void pollActive()
    void pollSlow()
    // A hidden tab asks nothing: nobody is looking at the conductor.
    const active = setInterval(() => !document.hidden && void pollActive(), ACTIVE_POLL_MS)
    const slow = setInterval(() => !document.hidden && void pollSlow(), SLOW_POLL_MS)
    return () => {
      clearInterval(active)
      clearInterval(slow)
    }
  }, [producerBasePath, pollActive, pollSlow])

  // The last run is re-read the moment the runs in flight drain, so a failure shows
  // when it happens rather than up to 30s later.
  useEffect(() => {
    if (activeRuns === 0 && reachable) void pollSlow()
  }, [activeRuns, reachable, pollSlow])

  const facts: ConductorFacts = {
    reachable,
    enabled,
    // A question asked here is a run in flight before the next poll can see it.
    activeRuns: Math.max(activeRuns, asking ? 1 : 0),
    lastRunError,
    needsYou: signals.length,
  }
  const state = conductorState(facts)
  const canAnswer = conductorCanAnswer(facts)
  const statusText = conductorStatusText(state, facts)

  const ask = async (event: FormEvent) => {
    event.preventDefault()
    const message = draft.trim()
    if (!message) return
    if (!canAnswer) {
      setAnswer({ kind: 'error', text: 'it is busy conducting a run — ask again when it ends' })
      return
    }
    setAsking(true)
    setAnswer(null)
    try {
      const response = await apiFetch(`${producerBasePath}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, trigger: 'user' }),
      })
      const body = (await response.json().catch(() => ({}))) as { reply?: string; error?: string }
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      setDraft('')
      setAnswer({ kind: 'reply', text: body.reply ?? '' })
    } catch (error) {
      // The draft stays, so asking again is one Enter away.
      setAnswer({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setAsking(false)
      void pollActive()
      void pollSlow()
    }
  }

  if (!producerBasePath) return null

  const placeholder =
    state === 'offline'
      ? 'Orchestrator unreachable'
      : !canAnswer
        ? 'Busy conducting — ask when this run ends'
        : 'Ask the orchestrator…'

  return (
    <div className="bc-conductor" data-state={state} data-asking={asking ? 'true' : undefined}>
      {(answer || asking) && (
        <div className="bc-conductor-reply" data-kind={answer?.kind ?? 'waiting'} role="status">
          {asking ? (
            <span className="bc-conductor-reply-waiting">thinking…</span>
          ) : (
            <button
              type="button"
              className="bc-conductor-reply-text"
              onClick={onOpenOrchestrator}
              title="Open the whole conversation with the orchestrator"
            >
              {answer!.kind === 'error' ? `Couldn’t ask: ${answer!.text}` : answer!.text}
            </button>
          )}
          {answer && (
            <button
              type="button"
              className="bc-conductor-reply-close"
              onClick={() => setAnswer(null)}
              aria-label="Dismiss the orchestrator’s reply"
            >
              ✕
            </button>
          )}
        </div>
      )}
      <div className="bc-conductor-row">
        <button
          type="button"
          className="bc-conductor-crab"
          onClick={onOpenOrchestrator}
          aria-label={`Open the orchestrator — ${statusText}`}
          title={unreachableBecause ? `Orchestrator unreachable: ${unreachableBecause}` : `Orchestrator — ${statusText}`}
        >
          <span className="bc-conductor-mascot" aria-hidden />
          <span className="bc-conductor-emoji" aria-hidden>
            🎬
          </span>
        </button>
        <div className="bc-conductor-main">
          <div className="bc-conductor-status">
            <span className="bc-conductor-dot" aria-hidden />
            {state === 'alert' ? (
              <button type="button" className="bc-conductor-needs" onClick={onOpenSignalsPage}>
                {statusText}
              </button>
            ) : (
              <span className="bc-conductor-status-text" title={lastRunError ?? undefined}>
                {statusText}
              </span>
            )}
          </div>
          <form className="bc-conductor-ask" onSubmit={ask}>
            <input
              className="bc-conductor-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              disabled={state === 'offline'}
              aria-label="Ask the orchestrator"
            />
          </form>
        </div>
      </div>
    </div>
  )
}
