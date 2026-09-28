import type { SessionAction, SessionActionType } from '@kayushkin/chat-core'

/**
 * What the chat says about a session action — a button the agent put in its chat,
 * which llm-bridge-server runs when the person confirms it. Pure, so the rules have
 * tests; `components/chat/SessionActions.tsx` only draws them.
 */

/** What each action type does, in a few words, for the line under the label. */
export const SESSION_ACTION_TYPE_LABEL: Record<SessionActionType, string> = {
  deploy: 'Deploy',
  run_scheduler_job: 'Run a scheduler job',
  send_message: 'Send a message here',
  fork_and_send: 'Fork this session and send',
  new_session_and_send: 'Start a new session and send',
}

/** The button can be pressed only while the action waits for its one run. */
export function sessionActionIsConfirmable(action: SessionAction): boolean {
  return action.state === 'offered'
}

/** Who ran it: principal-store's id of the person, or the internal service when no
 *  person was named. */
export function sessionActionRunBy(action: SessionAction): string {
  return action.run_by_principal_id || 'the internal service'
}

/** One line for a step of an action's run, as the chat shows it where the step
 *  happened. `offered` is the button itself and has no step line. */
export function sessionActionStepText(action: SessionAction): string {
  const label = action.offer.label
  switch (action.state) {
    case 'offered':
      return `Offered: ${label}`
    case 'running':
      return `${label} — confirmed by ${sessionActionRunBy(action)}, running`
    case 'succeeded':
      return `${label} — done`
    case 'failed':
      return `${label} — failed: ${action.error ?? 'no reason given'}`
    case 'outcome_unknown':
      return `${label} — outcome unknown: ${action.error ?? 'no reason given'}`
  }
}

/** The state shown on the button once it has been pressed. */
export function sessionActionStatusText(action: SessionAction): string {
  switch (action.state) {
    case 'offered':
      return ''
    case 'running':
      return 'Running…'
    case 'succeeded':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'outcome_unknown':
      return 'Outcome unknown'
  }
}
