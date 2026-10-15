import { useMemo } from 'react'
import { SIGNAL_KIND_QUESTION, useOpenSignals, type SignalRequest } from '@kayushkin/chat-core'
import { questionRequestsOfSession, requestsOfSessionWithoutQuestion } from '../../sessionOpenQuestions'

/**
 * The sessions that have an open question recorded against them, across EVERY session
 * rather than the sidebar's loaded page.
 *
 * This exists because session state is the wrong thing to hang a question marker on. A
 * signal outlives the state that produced it: the agent asks, the turn ends, the session
 * settles to `completed` or is `aborted` — and the question is still open and still
 * unanswered. Measured on this host 2026-08-18: of 19 open chat signals, ZERO belonged to a
 * session in `awaiting_user`/`awaiting_permission`, so a state-gated marker drew nothing at
 * all while the original chat's inbox listed all 19.
 *
 * One request for the whole sidebar, not one per row: `useOpenSignals()` with no session id
 * is the cross-session read, and it is shared through the same 30s cache and resolve
 * announcement as every other signals surface, so answering a question anywhere clears the
 * marker here without a refetch.
 *
 * `available` is false when the server answers 404 — a bridge-server predating the signals
 * route. Callers must fall back to session state rather than concluding nothing is waiting.
 *
 * A notification is not a question: it is read and acknowledged, never answered, and
 * badging a row for one would say work is waiting when none is.
 */
export function useSessionsWithOpenQuestion(): {
  sessionIds: ReadonlySet<string>
  available: boolean
} {
  const { signals, available } = useOpenSignals()
  const sessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const signal of signals) {
      if (signal.kind === SIGNAL_KIND_QUESTION) ids.add(signal.sessionId)
    }
    return ids
  }, [signals])
  return { sessionIds, available }
}

export interface OpenSignalRequestsOfSession {
  /** Groups of this session that ask a question — see `questionRequestsOfSession`. */
  questionRequests: SignalRequest[]
  /** Every other open group of this session: notifications. */
  requestsWithoutQuestion: SignalRequest[]
  /** False when this bridge-server has no signals route (404). */
  available: boolean
  /** The cross-session read failed; nothing here says whether a question waits. */
  error: string | null
  /** Re-read the cross-session list. */
  reload: () => void
}

/**
 * One session's open signals, taken from the SAME cross-session read as
 * {@link useSessionsWithOpenQuestion} rather than from a read of its own.
 *
 * This is what lets every session chip in a transcript carry its questions: forty
 * chips cost the one `/signals` request the sidebar already makes, not forty. A
 * resolve anywhere in the tab drops that read's cache and every chip re-reads it
 * together (chat-core's `subscribeToSignalChanges`), so an answered question
 * leaves every chip at once without a reload.
 */
export function useOpenSignalRequestsOfSession(sessionId: string): OpenSignalRequestsOfSession {
  const { requests, available, error, reload } = useOpenSignals()
  const questionRequests = useMemo(() => questionRequestsOfSession(requests, sessionId), [requests, sessionId])
  const requestsWithoutQuestion = useMemo(
    () => requestsOfSessionWithoutQuestion(requests, sessionId),
    [requests, sessionId],
  )
  return { questionRequests, requestsWithoutQuestion, available, error, reload }
}
