import { useCallback, useEffect, useState } from 'react'
import { useOpenSignals, useSessionStatus } from '@kayushkin/chat-core'
import { useBridgeConfig } from '../../context'
import {
  conductorState,
  conductorStatusText,
  newestSignalTime,
  signalsRaisedSince,
  type ConductorFacts,
} from '../../conductorState'
import { chatKey } from './storageKeys'

// The orchestrator as the conductor at the foot of the sidebar: what it is doing, a
// click to open its home session, and what needs you. A host theme with a character
// draws it in `.bc-conductor-mascot` by the dock's `data-state`; bridge-ui itself
// shows the 🎬 and a coloured dot.
//
// Busy or not is the home session's own state, read from the session data the chat
// already holds (`useSessionStatus`), so it needs no poll of its own. Talking to the
// orchestrator happens in that session's chat, so the dock has no composer.

// How often to re-read the settings: autonomous mode, and whether producerd answers.
const CONFIG_POLL_MS = 30_000
// The newest signal you have opened from the conductor. Older ones are waiting, not new.
const SEEN_SIGNALS_KEY = chatKey('conductor-signals-seen-up-to')

function readSeenUpTo(): string | null {
  try {
    return window.localStorage.getItem(SEEN_SIGNALS_KEY)
  } catch {
    return null
  }
}

interface ProducerSettings {
  enabled: boolean
}

export interface ConductorDockProps {
  /** The home session's id, from `GET /home-session`; null until producerd names it. */
  homeSessionId: string | null
  /** Why producerd could not name the home session, verbatim. */
  homeSessionError: string | null
  /** Open the home session's chat. */
  onOpenHomeSession: () => void
  /** Open every open signal on the thread pane's full width. */
  onOpenSignalsPage: () => void
}

export function ConductorDock({ homeSessionId, homeSessionError, onOpenHomeSession, onOpenSignalsPage }: ConductorDockProps) {
  const { fetch: apiFetch, producerBasePath } = useBridgeConfig()
  const { signals } = useOpenSignals()
  const homeSessionStatus = useSessionStatus(homeSessionId)
  const [configReachable, setConfigReachable] = useState<boolean | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [seenUpTo, setSeenUpTo] = useState<string | null>(readSeenUpTo)
  const raisedAt = signals.map((signal) => signal.createdAt)

  const openSignals = () => {
    const newest = newestSignalTime(raisedAt)
    if (newest) {
      setSeenUpTo(newest)
      try {
        window.localStorage.setItem(SEEN_SIGNALS_KEY, newest)
      } catch {
        // Storage refused (private mode, quota): the alert comes back on the next load.
      }
    }
    onOpenSignalsPage()
  }

  const pollConfig = useCallback(async () => {
    try {
      const response = await apiFetch(`${producerBasePath}/config`)
      if (!response.ok) throw new Error(`/config: HTTP ${response.status}`)
      const settings = (await response.json()) as ProducerSettings
      setEnabled(settings.enabled)
      setConfigReachable(true)
      setConfigError(null)
    } catch (error) {
      setConfigReachable(false)
      setConfigError(error instanceof Error ? error.message : String(error))
    }
  }, [apiFetch, producerBasePath])

  useEffect(() => {
    if (!producerBasePath) return
    void pollConfig()
    // A hidden tab asks nothing: nobody is looking at the conductor.
    const timer = setInterval(() => !document.hidden && void pollConfig(), CONFIG_POLL_MS)
    return () => clearInterval(timer)
  }, [producerBasePath, pollConfig])

  const unreachableBecause = configError ?? homeSessionError
  const facts: ConductorFacts = {
    reachable: unreachableBecause ? false : configReachable,
    enabled,
    homeSessionState: homeSessionStatus?.state ?? null,
    needsYou: signals.length,
    newNeedsYou: signalsRaisedSince(raisedAt, seenUpTo),
  }
  const state = conductorState(facts)
  const statusText = conductorStatusText(state, facts)

  if (!producerBasePath) return null

  return (
    <div className="bc-conductor" data-state={state}>
      <div className="bc-conductor-row">
        <button
          type="button"
          className="bc-conductor-crab"
          onClick={onOpenHomeSession}
          aria-label={`Open the orchestrator’s session — ${statusText}`}
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
              <button type="button" className="bc-conductor-needs" onClick={openSignals}>
                {statusText}
              </button>
            ) : (
              <span className="bc-conductor-status-text" title={unreachableBecause ?? undefined}>
                {statusText}
              </span>
            )}
            {state !== 'alert' && facts.needsYou > 0 && (
              <button type="button" className="bc-conductor-waiting" onClick={openSignals}>
                · {facts.needsYou} waiting
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
