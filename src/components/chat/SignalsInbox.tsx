import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useOpenSignalsByAttention, useSessionNames, type Signal, type SignalRequest } from '@kayushkin/chat-core'
import { SignalRequestCard } from './SignalCard'
import { loadBackgroundInboxOpen, loadInboxOpen, saveBackgroundInboxOpen, saveInboxOpen } from './sidebarPersistence'
import { backgroundSessionTypeLabel, sessionTypeOfRequest, signalSection } from '../../signalAttentionSections'
import styles from './Chat.module.css'

/**
 * Everything waiting on the operator, across every session — the sidebar's "Needs you" —
 * and, under it, a quieter "Background agents" group for everything else.
 *
 * ## Two groups, by session type
 *
 * "Needs you" holds the signals of interactive and herald sessions only, and only its
 * count is the operator's to clear. Autoworkers, delegates, scheduled tasks, system and
 * external sessions — and any session whose type is unknown — raise far more signals
 * than the operator does (319 of 408 open on 2026-10-19), so they are listed apart:
 * collapsed by default, neutral in colour, with their own count. Which group a signal
 * is in is chat-core's rule (`useOpenSignalsByAttention`), not this component's.
 *
 * ## Why a list, when the sidebar already marks the rows
 *
 * `QuestionMarkers` puts a `?` on the row that owns a question, and the reasoning
 * there is right as far as it goes: a count tells you a number, a marker tells you
 * WHICH ROW. What it assumes is that there IS a row.
 *
 * There usually is not. The sidebar loads a newest-first page; a session that asked
 * something and then went quiet sinks out of that page while its question stays open,
 * because a signal outlives the session state that produced it. Measured on this host
 * while building this: 21 open chat signals across 17 sessions, and 11 of those 17
 * sessions had no row in the sidebar's first page at all. Their questions were
 * unreachable in chat by any route — no row, so no marker, so nothing.
 *
 * So this is not a count replacing the markers. It is the surface for the signals
 * that have no row to sit on, and every card NAMES its session and opens it, which is
 * the same "which one" the marker gives you, carried on the card instead of the row.
 *
 * ## What it costs
 *
 * Nothing extra. `useOpenSignalsByAttention()` splits the same cross-session read the
 * sidebar already makes for `useSessionsWithOpenOperatorQuestion`, through one 30s cache
 * entry keyed by `''`. Names for sessions the sidebar has not loaded
 * come from one batched lookup — see `useSessionNames`.
 */
export default function SignalsInbox({
  onSelectSession,
  onOpenSignalsPage,
}: {
  /** Open the session a card belongs to. */
  onSelectSession: (sessionId: string) => void
  /** Show every signal on the thread pane's full width (`SignalsPage`). */
  onOpenSignalsPage: () => void
}) {
  const { operator, background, sessionTypeOf, available, error, reload } = useOpenSignalsByAttention()
  const [open, setOpen] = useState(loadInboxOpen)
  const [backgroundOpen, setBackgroundOpen] = useState(loadBackgroundInboxOpen)

  const needsYou = useMemo(() => signalSection(operator), [operator])
  const backgroundSection = useMemo(() => signalSection(background), [background])
  // Names only for cards that are drawn. Asking for them behind a shut panel is a
  // request for something nobody can see.
  const sessionIds = useMemo(
    () => [
      ...(open ? needsYou.requests.map(request => request.sessionId) : []),
      ...(backgroundOpen ? backgroundSection.requests.map(request => request.sessionId) : []),
    ],
    [open, backgroundOpen, needsYou, backgroundSection],
  )
  const sessionName = useSessionNames(sessionIds)

  const toggle = useCallback(() => {
    setOpen(previous => {
      saveInboxOpen(!previous)
      return !previous
    })
  }, [])
  const toggleBackground = useCallback(() => {
    setBackgroundOpen(previous => {
      saveBackgroundInboxOpen(!previous)
      return !previous
    })
  }, [])

  // Absent rather than empty. A bridge-server with no signals route answers 404
  // (`available === false`), which is not "nothing is waiting".
  if (!available) return null
  const showNeedsYou = needsYou.signalCount > 0 || error !== null
  const showBackground = backgroundSection.signalCount > 0
  if (!showNeedsYou && !showBackground) return null

  const renderRequests = (requests: readonly SignalRequest[], label: (request: SignalRequest) => ReactNode) =>
    requests.map(request => (
      <SignalRequestCard
        // A derived group has no request id, so it is keyed by its one signal's
        // id — never by the empty string, which every derived group shares.
        key={request.requestId || request.signals[0]?.id}
        request={request}
        compact
        onResolved={reload}
        // ⚠️ The ONE surface that offers this. A signal here belongs to a session you
        // are not looking at and very likely cannot answer — the agent that asked has
        // usually stopped. Without it the only way to clear the row is to open the
        // session and answer a question that no longer matters.
        //
        // The chat pane deliberately does NOT pass it: there, answering IS the close.
        allowDismissWithoutAnswer
        header={
          <button
            type="button"
            className={styles.inboxSessionButton}
            title="Open this session"
            onClick={() => onSelectSession(request.sessionId)}
          >
            {label(request)}
          </button>
        }
      />
    ))

  return (
    <>
      {showNeedsYou && (
        <div className={styles.inbox} role="region" aria-label="Signals needing you">
          <div className={styles.inboxHeaderRow}>
            <button type="button" className={styles.inboxHeader} aria-expanded={open} onClick={toggle}>
              <span className={styles.inboxCaret} aria-hidden>
                {open ? '▾' : '▸'}
              </span>
              <span className={styles.inboxTitle}>Needs you</span>
              <span className={styles.inboxCount}>{needsYou.signalCount}</span>
            </button>
          </div>

          {/* Reported even while collapsed: a failed read is why the panel might be
              short, and saying so only when expanded would hide the reason. */}
          {error !== null && <p className={styles.inboxError}>Couldn’t load: {error}</p>}

          {open && (
            <div className={styles.inboxBody}>
              <button
                type="button"
                className={styles.inboxOpenPage}
                title="Show every signal in full, in place of the chat"
                onClick={onOpenSignalsPage}
              >
                Open all on the signals page
              </button>
              {renderRequests(needsYou.requests, request => sessionName(request.sessionId))}
            </div>
          )}
        </div>
      )}

      {showBackground && (
        <div className={styles.backgroundInbox} role="region" aria-label="Background agents’ signals">
          <div className={styles.inboxHeaderRow}>
            <button
              type="button"
              className={styles.backgroundInboxHeader}
              aria-expanded={backgroundOpen}
              onClick={toggleBackground}
              title="Questions and notifications from autoworkers and other background sessions. Not counted as needing you."
            >
              <span className={styles.inboxCaret} aria-hidden>
                {backgroundOpen ? '▾' : '▸'}
              </span>
              <span className={styles.inboxTitle}>Background agents</span>
              <span className={styles.backgroundInboxCount}>{backgroundSection.signalCount}</span>
            </button>
          </div>
          {backgroundOpen && (
            <div className={styles.inboxBody}>
              {renderRequests(backgroundSection.requests, request =>
                backgroundCardLabel(request, sessionName, sessionTypeOf),
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** A background card's session line: its name and what kind of session it is, since
 *  in this group the kind is the first thing that says whether to read it. */
function backgroundCardLabel(
  request: SignalRequest,
  sessionName: (sessionId: string) => string,
  sessionTypeOf: (signal: Signal) => string,
): string {
  return `${sessionName(request.sessionId)} · ${backgroundSessionTypeLabel(sessionTypeOfRequest(request, sessionTypeOf))}`
}
