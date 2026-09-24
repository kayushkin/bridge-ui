import { useMemo } from 'react'
import {
  SIGNAL_KIND_QUESTION,
  useOpenSignals,
  useSessionNames,
  type Signal,
  type SignalRequest,
} from '@kayushkin/chat-core'
import { SignalRequestCard } from './SignalCard'
import { RefChip } from './RefChip'
import { questionsFirst } from './SignalsInbox'
import { timeAgo } from '../../utils'
import styles from './Chat.module.css'

/**
 * Every open signal on the thread pane's full width — the sidebar's "Needs you",
 * opened out so several can be read and answered in one sitting.
 *
 * The sidebar panel is capped at a third of the sidebar's height and draws compact
 * cards, which drop each signal's body and each option's description. That is right
 * for a glance and wrong for answering: the body is usually the part that says what
 * the question is about. Here every card is full size, and each carries what the
 * sidebar has no room for — when it was raised, by what, who it is for, the todo it
 * belongs to, and a reply triage drafted for the customer.
 *
 * Same read as the sidebar (`useOpenSignals()` with no session id), so the two share
 * one cache entry and a card answered here leaves the sidebar count too.
 */
export default function SignalsPage({
  onSelectSession,
  onClose,
}: {
  /** Open the session a card belongs to. */
  onSelectSession: (sessionId: string) => void
  /** Go back to the chat thread. */
  onClose: () => void
}) {
  const { signals, requests, available, loading, error, reload } = useOpenSignals()
  const ordered = useMemo(() => questionsFirst(requests), [requests])
  const questions = ordered.filter(holdsQuestion)
  const notifications = ordered.filter(request => !holdsQuestion(request))
  const sessionIds = useMemo(() => ordered.map(request => request.sessionId), [ordered])
  const sessionName = useSessionNames(sessionIds)

  const renderRequest = (request: SignalRequest) => (
    <SignalRequestCard
      // A derived group has no request id, so it is keyed by its one signal's id.
      key={request.requestId || request.signals[0]?.id}
      request={request}
      onResolved={reload}
      // As in the sidebar inbox: the session that asked has usually stopped, and
      // without this the only way to clear the row is to answer a question that no
      // longer matters.
      allowDismissWithoutAnswer
      header={
        <SignalRequestDetails
          request={request}
          sessionName={sessionName(request.sessionId)}
          onSelectSession={onSelectSession}
        />
      }
    />
  )

  return (
    <div className={styles.signalsPage} role="region" aria-label="Signals needing you">
      <div className={styles.signalsPageHeader}>
        <h2 className={styles.signalsPageTitle}>Needs you</h2>
        <span className={styles.inboxCount}>{signals.length}</span>
        <span className={styles.signalsPageSpacer} />
        <button type="button" className="bc-ctrl-btn" onClick={reload} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button type="button" className="bc-ctrl-btn" onClick={onClose}>
          Back to chat
        </button>
      </div>

      <div className={styles.signalsPageBody}>
        {error !== null && <p className={styles.inboxError}>Couldn’t load: {error}</p>}
        {!available && (
          <p className={styles.signalsPageEmpty}>This bridge server has no signals route.</p>
        )}
        {available && error === null && !loading && ordered.length === 0 && (
          <p className={styles.signalsPageEmpty}>Nothing is waiting on you.</p>
        )}

        {questions.length > 0 && (
          <section className={styles.signalsPageSection}>
            <h3 className={styles.signalsPageSectionTitle}>Questions · {questions.length}</h3>
            {questions.map(renderRequest)}
          </section>
        )}
        {notifications.length > 0 && (
          <section className={styles.signalsPageSection}>
            <h3 className={styles.signalsPageSectionTitle}>
              Notifications · {notifications.length}
            </h3>
            {notifications.map(renderRequest)}
          </section>
        )}
      </div>
    </div>
  )
}

function holdsQuestion(request: SignalRequest): boolean {
  return request.signals.some(signal => signal.kind === SIGNAL_KIND_QUESTION)
}

/**
 * The line above a card: which session, when, raised by what, for whom, and the todo
 * it belongs to — plus triage's drafted customer reply when there is one.
 *
 * Read off the request's first signal. The signals in one request come from one tool
 * call in one session, so they share all of these.
 */
function SignalRequestDetails({
  request,
  sessionName,
  onSelectSession,
}: {
  request: SignalRequest
  sessionName: string
  onSelectSession: (sessionId: string) => void
}) {
  const first: Signal | undefined = request.signals[0]
  if (!first) return null
  const draft = request.signals.find(signal => signal.customerReplyDraft !== null)?.customerReplyDraft

  return (
    <div className={styles.signalsPageDetails}>
      <div className={styles.signalsPageMeta}>
        <button
          type="button"
          className={styles.inboxSessionButton}
          title="Open this session"
          onClick={() => onSelectSession(request.sessionId)}
        >
          {sessionName}
        </button>
        <span title={first.createdAt}>{timeAgo(first.createdAt)}</span>
        {first.source !== '' && <span>from {first.source}</span>}
        {first.sessionType !== '' && <span>{first.sessionType} session</span>}
        {first.audience !== '' && <span>for the {first.audience}</span>}
        {first.linkedTodoId !== '' && <RefChip kind="todo" refId={first.linkedTodoId} />}
      </div>
      {draft && (
        <details className={styles.signalsPageDraft}>
          <summary>Drafted reply to the customer{draft.to !== '' ? ` (${draft.to})` : ''}</summary>
          <p className={styles.signalsPageDraftSubject}>{draft.subject}</p>
          <p className={styles.signalsPageDraftBody}>{draft.body}</p>
        </details>
      )}
    </div>
  )
}
