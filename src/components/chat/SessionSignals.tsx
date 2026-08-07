import { SignalRequestCard } from './SignalCard'
import { groupSignalsByRequest, useOpenChatSignals } from './signalData'

export interface SessionSignalsProps {
  sessionId: string
  /** request_ids the surrounding surface is already rendering itself. The
   * raising session's chat passes its parked hooks: PendingPermissionsBanner
   * renders those from the live tool input, with the multi-select and option
   * previews the signal record does not carry, so showing a signal card for
   * the same question underneath it would be the same question twice. What is
   * left is what the banner cannot show — signals whose park has gone (a
   * harness restart), and, once P3 lands, derived ones. */
  excludeRequestIds?: string[]
  compact?: boolean
  /** Heading above the cards. Omit for surfaces tight enough that the card's
   * own "question"/"notification" label is heading enough. */
  title?: string
}

/** SessionSignals is the open chat signals raised by one session, answerable
 * in place. Renders nothing when the session has none, when the surrounding
 * surface already renders all of them, or when this bridge-server has no
 * signals route. */
export function SessionSignals({ sessionId, excludeRequestIds, compact, title }: SessionSignalsProps) {
  // The pending-hook set is the one thing a caller already knows that changes
  // when a signal is minted or closed, so it doubles as the refresh trigger —
  // there is no signal event on the SSE stream yet.
  const excluded = excludeRequestIds ?? []
  const { signals, error, reload } = useOpenChatSignals(sessionId, excluded.join(','))

  const shown = signals.filter(s => !s.request_id || !excluded.includes(s.request_id))
  if (error) return <p className="bc-signal-error">Couldn’t load signals: {error}</p>
  if (shown.length === 0) return null

  return (
    <div className="bc-signals" role="region" aria-label="Session signals">
      {title && <div className="bc-signals-title">{title}</div>}
      {groupSignalsByRequest(shown).map(request => (
        <SignalRequestCard
          key={request.requestId || request.signals[0].id}
          request={request}
          compact={compact}
          onResolved={reload}
        />
      ))}
    </div>
  )
}

export interface SignalsInboxProps {
  /** Opens the raising session. The inbox is cross-session, so answering
   * usually wants the option of going there. */
  onSelectSession?: (sessionId: string) => void
  /** Resolves a session id to the name shown in the list. */
  getSessionName?: (sessionId: string) => string
  /** Bumped by the caller when session state changes, so the inbox refetches
   * without polling. */
  refreshKey?: string | number
}

/** SignalsInbox is every open chat signal across every session — the "Needs
 * you" list. Renders nothing when there are none or when this bridge-server
 * has no signals route. */
export function SignalsInbox({ onSelectSession, getSessionName, refreshKey }: SignalsInboxProps) {
  const { signals, error, reload } = useOpenChatSignals(undefined, refreshKey)

  if (error) return <p className="bc-signal-error">Couldn’t load signals: {error}</p>
  if (signals.length === 0) return null

  const requests = groupSignalsByRequest(signals)

  return (
    <div className="bc-signals bc-signals-inbox" role="region" aria-label="Signals needing you">
      <div className="bc-signals-title">
        Needs you
        <span className="bc-signals-count">{requests.length}</span>
      </div>
      {requests.map(request => (
        <SignalRequestCard
          key={request.requestId || request.signals[0].id}
          request={request}
          onResolved={reload}
          header={
            <button
              type="button"
              className="bc-signals-session"
              disabled={!onSelectSession}
              onClick={() => onSelectSession?.(request.sessionId)}
              title="Open this session"
            >
              {getSessionName?.(request.sessionId) || request.sessionId}
            </button>
          }
        />
      ))}
    </div>
  )
}
