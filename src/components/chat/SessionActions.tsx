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
 * The agent places a button by writing its id (`session_action_000007`) in its reply;
 * `RefChip` hands that id here and the button is drawn in the sentence. An action the
 * agent never placed is drawn where it was offered instead. Either way the button's
 * text is the agent's label, "What it runs" shows the server's own statement of the
 * command, and pressing asks again in place — Confirm or Cancel. Only Confirm reaches
 * the server, which runs the action and records who pressed it.
 *
 * Every element is phrasing content (span, button, code) so the button can sit inside
 * a paragraph; the stylesheet lays it out.
 */

export interface SessionActionsInSession {
  /** The newest record of every action in the session, by `action_id`. The offer's
   *  entry keeps the record as it was offered, so a button reads its state here. */
  newest: ReadonlyMap<string, SessionAction>
  /** The actions whose id the agent wrote in its reply, where their buttons are drawn. */
  placedInProse: ReadonlySet<string>
}

/** Empty outside a session's turn list, so an id written anywhere else — a card
 *  panel, another session's text — draws no button. */
export const SessionActionsContext = createContext<SessionActionsInSession>({
  newest: new Map(),
  placedInProse: new Set(),
})

/** One action entry: the button where it was offered unless the agent placed it in
 *  its reply, and a line for every later step. */
export function SessionActionEntry({ action }: { action: SessionAction }) {
  const { newest, placedInProse } = useContext(SessionActionsContext)
  if (action.state !== 'offered') return <SessionActionStep action={action} />
  if (placedInProse.has(action.action_id)) return null
  return <SessionActionButton action={newest.get(action.action_id) ?? action} />
}

/** A session action id written in text. Drawn as the button when this session's agent
 *  offered that action; otherwise it stays the id as written, so text can point at a
 *  button but never make one. */
export function SessionActionInText({ actionId }: { actionId: string }) {
  const action = useContext(SessionActionsContext).newest.get(actionId)
  if (!action) return <>{actionId}</>
  return <SessionActionButton action={action} />
}

function SessionActionButton({ action }: { action: SessionAction }) {
  const { api } = useChatContext()
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [showingCommand, setShowingCommand] = useState(false)
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
    <span className={`bc-session-action bc-session-action-${action.state}`} data-action-id={action.action_id}>
      <button
        type="button"
        className="bc-session-action-button"
        disabled={!confirmable || confirming}
        onClick={() => setConfirming(true)}
        title={SESSION_ACTION_TYPE_LABEL[action.offer.type]}
      >
        {action.offer.label}
      </button>
      <button
        type="button"
        className="bc-session-action-what"
        aria-expanded={showingCommand}
        onClick={() => setShowingCommand((showing) => !showing)}
      >
        What it runs {showingCommand ? '▴' : '▾'}
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
      {showingCommand && <code className="bc-session-action-command">{action.command}</code>}
      {refusal && <span className="bc-session-action-refusal">{refusal}</span>}
      {!confirmable && <SessionActionOutcome action={action} />}
    </span>
  )
}

/** Who ran it, and what came back. */
function SessionActionOutcome({ action }: { action: SessionAction }) {
  const [showingOutput, setShowingOutput] = useState(false)
  return (
    <span className="bc-session-action-outcome">
      <span>
        Confirmed by <code>{sessionActionRunBy(action)}</code>
        {action.result_session_id && (
          <>
            {' '}· session <RefChip kind="session" refId={action.result_session_id} />
          </>
        )}
      </span>
      {action.error && <span className="bc-session-action-error">{action.error}</span>}
      {action.output && (
        <>
          <button
            type="button"
            className="bc-session-action-what"
            aria-expanded={showingOutput}
            onClick={() => setShowingOutput((showing) => !showing)}
          >
            Output {showingOutput ? '▴' : '▾'}
          </button>
          {showingOutput && <span className="bc-session-action-output">{action.output}</span>}
        </>
      )}
    </span>
  )
}

function SessionActionStep({ action }: { action: SessionAction }) {
  return (
    <div className={`bc-session-action-step bc-session-action-${action.state}`} data-action-id={action.action_id}>
      {sessionActionStepText(action)}
    </div>
  )
}
