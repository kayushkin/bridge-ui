import { useCallback, useMemo, useState } from 'react'
import { SIGNAL_KIND_QUESTION, useOpenSignals, useSessionNames, type SignalRequest } from '@kayushkin/chat-core'
import { SignalRequestCard } from './SignalCard'
import { loadInboxOpen, saveInboxOpen } from './sidebarPersistence'
import styles from './Chat.module.css'

/**
 * Everything waiting on a human, across every session — the sidebar's "Needs you".
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
 * Nothing extra. `useOpenSignals()` with no session id is the same cross-session read
 * the sidebar already makes for `useSessionsWithOpenQuestion`, and both go through
 * one 30s cache entry keyed by `''`. Names for sessions the sidebar has not loaded
 * come from one batched lookup — see `useSessionNames`.
 */
export default function SignalsInbox({
  onSelectSession,
}: {
  /** Open the session a card belongs to. */
  onSelectSession: (sessionId: string) => void
}) {
  const { signals, requests, available, error, reload } = useOpenSignals()
  const [open, setOpen] = useState(loadInboxOpen)

  const ordered = useMemo(() => questionsFirst(requests), [requests])
  // Nothing while collapsed. Names are only ever rendered on the cards, so asking for
  // them behind a shut panel is a request for something nobody can see — and a user
  // who keeps the inbox closed would pay it on every load. Expanding fetches them.
  const sessionIds = useMemo(
    () => (open ? ordered.map(request => request.sessionId) : []),
    [open, ordered],
  )
  const sessionName = useSessionNames(sessionIds)

  const toggle = useCallback(() => {
    setOpen(previous => {
      saveInboxOpen(!previous)
      return !previous
    })
  }, [])

  // The count is of SIGNALS, not of request groups. One AskUserQuestion call mints a
  // row per question and they resolve together, so the groups are what you act on —
  // but "3" next to a panel holding 5 questions reads as a miscount to anyone who
  // then counts them.
  const waiting = signals.length

  // Absent rather than empty. A bridge-server with no signals route answers 404
  // (`available === false`), which is not "nothing is waiting" — and an empty inbox
  // with nothing in it is chrome that says only that it exists.
  if (!available || (waiting === 0 && error === null)) return null

  return (
    <div className={styles.inbox} role="region" aria-label="Signals needing you">
      <button
        type="button"
        className={styles.inboxHeader}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={styles.inboxCaret} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className={styles.inboxTitle}>Needs you</span>
        <span className={styles.inboxCount}>{waiting}</span>
      </button>

      {/* Reported even while collapsed, because a failed read is why the panel might
          be short — saying so only when expanded would hide the explanation behind
          the very control the user has no reason to touch. */}
      {error !== null && <p className={styles.inboxError}>Couldn’t load: {error}</p>}

      {open && (
        <div className={styles.inboxBody}>
          {ordered.map(request => (
            <SignalRequestCard
              // A derived group has no request id, so it is keyed by its one signal's
              // id — never by the empty string, which every derived group shares.
              key={request.requestId || request.signals[0]?.id}
              request={request}
              compact
              onResolved={reload}
              // ⚠️ The ONE surface that offers this. A signal here belongs to a
              // session you are not looking at and very likely cannot answer — the
              // agent that asked has usually stopped. Without it the only way to
              // clear the row is to open the session and answer a question that no
              // longer matters, so the inbox would fill up and stay full.
              //
              // The chat pane deliberately does NOT pass it: there, answering IS the
              // close, and the session is right in front of you.
              allowDismissWithoutAnswer
              header={
                <button
                  type="button"
                  className={styles.inboxSessionButton}
                  title="Open this session"
                  onClick={() => onSelectSession(request.sessionId)}
                >
                  {sessionName(request.sessionId)}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Questions before notifications, each keeping the server's order within its kind.
 *
 * A question blocks somebody; a notification is telling you something happened. On
 * this host notifications outnumber questions two to one, so leaving them interleaved
 * by recency buries the things that actually need an answer under a list of things
 * that do not.
 *
 * Sorted rather than filtered: a notification nobody has acknowledged is still
 * waiting, and dropping it here would leave chat with no surface that shows one at
 * all.
 */
export function questionsFirst(requests: readonly SignalRequest[]): SignalRequest[] {
  const holdsQuestion = (request: SignalRequest): boolean =>
    request.signals.some(signal => signal.kind === SIGNAL_KIND_QUESTION)
  // A stable partition, not a comparator: Array.prototype.sort is only guaranteed
  // stable in modern engines and a two-bucket split says what is meant anyway.
  const questions = requests.filter(holdsQuestion)
  const rest = requests.filter(request => !holdsQuestion(request))
  return [...questions, ...rest]
}
