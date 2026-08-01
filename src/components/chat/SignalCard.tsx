import { useCallback, useState, type ReactNode } from 'react'
import { useBridgeConfig } from '../../context'
import type { Signal, SignalAnswer } from '../../types'
import { SignalKindNotification, SignalSeverityWarn } from '../../types'
import {
  acknowledgeSignal,
  answerDerivedQuestion,
  declineSignalQuestions,
  dismissSignal,
  resolveSignalQuestions,
  type SignalRequest,
} from './signalData'

export interface SignalCardProps {
  signal: Signal
  /** The answer being composed for this signal. A signal is answered with an
   * option or with freeform text, never both — picking one clears the other. */
  answer?: SignalAnswer
  onChangeAnswer?: (answer: SignalAnswer) => void
  /** Acknowledge a notification. Left optional because a surface that cannot
   * refetch afterwards is better off not offering the button at all — the card
   * renders no action rather than one that leaves a resolved row on screen. */
  onAcknowledge?: () => void
  busy?: boolean
  /** Drops descriptions and the freeform box for tight surfaces (the RefChip
   * session panel). The question and its options still render — a compact card
   * is still answerable. */
  compact?: boolean
}

/** SignalCard renders exactly one signal record, by kind. It takes everything
 * through props and reads no session context, so the same card renders in the
 * raising session's chat, in the cross-session inbox, and inside another
 * session's RefChip panel.
 *
 * It composes an answer but never submits one: a tool question is one of
 * several sharing a parked request, and that whole request resolves at once.
 * SignalRequestCard below owns the submit. */
export function SignalCard({ signal, answer, onChangeAnswer, onAcknowledge, busy, compact }: SignalCardProps) {
  const isNotification = signal.kind === SignalKindNotification
  const options = signal.options ?? []
  const chosen = answer?.option ?? ''
  const text = answer?.text ?? ''

  return (
    <div className={`bc-signal-card${compact ? ' bc-signal-card-compact' : ''}`}>
      <div className="bc-signal-card-header">
        <span className={`bc-signal-kind bc-signal-kind-${isNotification ? 'notification' : 'question'}`}>
          {isNotification ? 'notification' : 'question'}
        </span>
        {isNotification && signal.severity === SignalSeverityWarn && (
          <span className="bc-signal-severity">warn</span>
        )}
      </div>

      <p className="bc-signal-title">{signal.title}</p>
      {signal.body && !compact && <p className="bc-signal-body">{signal.body}</p>}

      {!isNotification && options.length > 0 && (
        <div className="bc-signal-options">
          {options.map(option => (
            <label
              key={option.value || option.label}
              className={`bc-signal-option${chosen === (option.value || option.label) ? ' bc-signal-option-selected' : ''}`}
            >
              <input
                type="radio"
                name={`bc-signal-${signal.id}`}
                checked={chosen === (option.value || option.label)}
                disabled={busy || !onChangeAnswer}
                onChange={() => onChangeAnswer?.({ option: option.value || option.label })}
              />
              <span className="bc-signal-option-body">
                <span className="bc-signal-option-label">{option.label}</span>
                {option.description && !compact && (
                  <span className="bc-signal-option-desc">{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {!isNotification && signal.allow_freeform && !compact && (
        <textarea
          className="bc-signal-freeform"
          placeholder={options.length > 0 ? '…or answer in your own words' : 'Type your answer'}
          value={text}
          disabled={busy || !onChangeAnswer}
          onChange={e => onChangeAnswer?.({ text: e.target.value })}
          rows={2}
        />
      )}

      {isNotification && onAcknowledge && (
        <div className="bc-signal-actions">
          <button type="button" className="bc-signal-ack" disabled={busy} onClick={onAcknowledge}>
            Acknowledge
          </button>
        </div>
      )}
    </div>
  )
}

/** answerText is what goes on the wire for one signal: the picked option's
 * value, or the typed text. Empty means unanswered. */
function answerText(answer: SignalAnswer | undefined): string {
  return (answer?.option || answer?.text || '').trim()
}

export interface SignalRequestCardProps {
  request: SignalRequest
  /** Called after a successful resolve so the surface can refetch. */
  onResolved?: () => void
  /** Rendered above the questions — the inbox uses it for a link to the
   * raising session, the in-session surfaces pass nothing. */
  header?: ReactNode
  compact?: boolean
  /** Offer to close a question nobody is going to answer.
   *
   * Only meaningful for a derived question: a parked tool question already has
   * Decline, which denies the call the question came from, and that is the
   * honest close there. A derived question parked nothing, so without this it
   * stays open until the session's next turn happens to supersede it — which,
   * on a card raised by a worker that has since stopped, is never.
   *
   * Off by default so the three chat surfaces keep answering as their only
   * close. The kanban drawer passes it because a card is where work is
   * abandoned as well as where it is answered. */
  allowDismissWithoutAnswer?: boolean
}

/** SignalRequestCard renders every signal minted by one parked request and
 * submits their answers together.
 *
 * One AskUserQuestion call carries several questions and resolves once, so
 * answering a single question in isolation would resolve the whole request
 * with the rest unanswered. Submit stays disabled until every question in the
 * request has an answer. */
export function SignalRequestCard({
  request,
  onResolved,
  header,
  compact,
  allowDismissWithoutAnswer,
}: SignalRequestCardProps) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  const [answers, setAnswers] = useState<Record<string, SignalAnswer>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const questions = request.signals.filter(s => s.kind !== SignalKindNotification)
  const allAnswered = questions.length > 0 && questions.every(s => answerText(answers[s.id]) !== '')

  const setAnswer = useCallback((signalID: string, answer: SignalAnswer) => {
    setAnswers(prev => ({ ...prev, [signalID]: answer }))
  }, [])

  const submit = useCallback(async () => {
    if (busy || !allAnswered) return
    setBusy(true)
    setError(null)
    try {
      if (request.requestId) {
        const payload: Record<string, string> = {}
        for (const signal of questions) payload[signal.title] = answerText(answers[signal.id])
        await resolveSignalQuestions(fetchFn, basePath, request.sessionId, request.requestId, payload)
      } else {
        // A derived question has no parked hook, so it resolves by becoming
        // the session's next user message. Grouping puts exactly one derived
        // signal in a group, so there is one answer to send.
        await answerDerivedQuestion(fetchFn, basePath, request.sessionId, answerText(answers[questions[0].id]))
      }
      onResolved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, allAnswered, questions, answers, fetchFn, basePath, request, onResolved])

  const acknowledge = useCallback(async (signalID: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await acknowledgeSignal(fetchFn, basePath, signalID)
      onResolved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, fetchFn, basePath, onResolved])

  const dismiss = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // A group of derived signals holds exactly one row today, but closing
      // every question in the group is what "dismiss this" means either way —
      // leaving a sibling open would be a half-closed request.
      for (const signal of questions) await dismissSignal(fetchFn, basePath, signal.id)
      onResolved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, questions, fetchFn, basePath, onResolved])

  const decline = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await declineSignalQuestions(fetchFn, basePath, request.sessionId, request.requestId)
      onResolved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, fetchFn, basePath, request, onResolved])

  return (
    <div className="bc-signal-request">
      {header}
      {request.signals.map(signal => (
        <SignalCard
          key={signal.id}
          signal={signal}
          answer={answers[signal.id]}
          // Notifications are acknowledged, not answered — they compose
          // nothing on either producer's path, and close one at a time
          // through the signal-level verb rather than with the group.
          onChangeAnswer={signal.kind === SignalKindNotification ? undefined : a => setAnswer(signal.id, a)}
          onAcknowledge={signal.kind === SignalKindNotification ? () => acknowledge(signal.id) : undefined}
          busy={busy}
          compact={compact}
        />
      ))}
      {questions.length > 0 && (
        <div className="bc-signal-actions">
          <button type="button" className="bc-signal-submit" disabled={busy || !allAnswered} onClick={submit}>
            {request.requestId ? 'Submit' : 'Send answer'}
          </button>
          {/* Declining means denying a parked tool call. A derived question
              parked nothing, so there is nothing to deny — it simply stays
              open until the session's next turn supersedes it. */}
          {request.requestId && (
            <button type="button" className="bc-signal-decline" disabled={busy} onClick={decline}>
              Decline
            </button>
          )}
          {/* Dismiss is the derived half of the same act: it says out loud
              that no answer is coming, which is the only thing that closes a
              derived question short of answering it. */}
          {!request.requestId && allowDismissWithoutAnswer && (
            <button type="button" className="bc-signal-dismiss" disabled={busy} onClick={dismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
      {error && <p className="bc-signal-error">{error}</p>}
    </div>
  )
}
