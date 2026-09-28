import { createContext, useContext, useState } from 'react'
import { useChatContext, type SessionAction } from '@kayushkin/chat-core'
import {
  SESSION_ACTION_TYPE_LABEL,
  sessionActionIsConfirmable,
  sessionActionRunBy,
  sessionActionStatusText,
  sessionActionStepText,
} from '../../sessionActionView'
import { RefChip } from './RefChip'

/**
 * Session actions in the chat: a button the agent offered, and a line for each step
 * of its one run.
 *
 * The button's text is the agent's label. "What it runs" opens the server's own
 * statement of the command, so what the person confirms is what they read. Pressing
 * the button asks again in place — Confirm or Cancel — and only Confirm reaches the
 * server, which runs the action and records who pressed it.
 */

/** The newest record of every action in the session, by `action_id`. The offer's entry
 *  keeps the record as it was offered, so the button reads its state from here. */
export const SessionActionsContext = createContext<ReadonlyMap<string, SessionAction>>(new Map())

/** One action entry: the button where it was offered, a line for every later step. */
export function SessionActionEntry({ action }: { action: SessionAction }) {
  const newest = useContext(SessionActionsContext).get(action.action_id) ?? action
  if (action.state === 'offered') return <SessionActionCard action={newest} />
  return <SessionActionStep action={action} />
}

function SessionActionCard({ action }: { action: SessionAction }) {
  const { api } = useChatContext()
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const confirmable = sessionActionIsConfirmable(action)

  const confirm = async () => {
    setSending(true)
    setRefusal(null)
    try {
      await api.runSessionAction(action.session_id, action.action_id)
      setConfirming(false)
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`bc-session-action bc-session-action-${action.state}`} data-action-id={action.action_id}>
      <div className="bc-session-action-row">
        <button
          type="button"
          className="bc-session-action-button"
          disabled={!confirmable || confirming}
          onClick={() => setConfirming(true)}
          title={confirmable ? SESSION_ACTION_TYPE_LABEL[action.offer.type] : undefined}
        >
          {action.offer.label}
        </button>
        {confirming && confirmable && (
          <span className="bc-session-action-confirm" role="group" aria-label={`Confirm ${action.offer.label}`}>
            <span className="bc-session-action-confirm-question">Run this?</span>
            <button type="button" className="bc-session-action-confirm-yes" disabled={sending} onClick={() => void confirm()}>
              {sending ? 'Starting…' : 'Confirm'}
            </button>
            <button
              type="button"
              className="bc-session-action-confirm-no"
              disabled={sending}
              onClick={() => {
                setConfirming(false)
                setRefusal(null)
              }}
            >
              Cancel
            </button>
          </span>
        )}
        {!confirmable && <span className="bc-session-action-status">{sessionActionStatusText(action)}</span>}
      </div>
      <details className="bc-session-action-detail">
        <summary>What it runs</summary>
        <div className="bc-session-action-command">{action.command}</div>
      </details>
      {refusal && <div className="bc-session-action-refusal">{refusal}</div>}
      {!confirmable && <SessionActionOutcome action={action} />}
    </div>
  )
}

/** Who ran it, and what came back. */
function SessionActionOutcome({ action }: { action: SessionAction }) {
  return (
    <div className="bc-session-action-outcome">
      <span>
        Confirmed by <code>{sessionActionRunBy(action)}</code>
      </span>
      {action.result_session_id && (
        <span>
          {' '}· session <RefChip kind="session" refId={action.result_session_id} />
        </span>
      )}
      {action.error && <div className="bc-session-action-error">{action.error}</div>}
      {action.output && (
        <details className="bc-session-action-detail">
          <summary>Output</summary>
          <pre className="bc-session-action-output">{action.output}</pre>
        </details>
      )}
    </div>
  )
}

function SessionActionStep({ action }: { action: SessionAction }) {
  return (
    <div className={`bc-session-action-step bc-session-action-${action.state}`} data-action-id={action.action_id}>
      {sessionActionStepText(action)}
    </div>
  )
}
