import { describe, expect, it } from 'vitest'
import type { SessionAction } from '@kayushkin/chat-core'
import {
  sessionActionIsConfirmable,
  sessionActionRunBy,
  sessionActionStatusText,
  sessionActionStepText,
} from '../src/sessionActionView'

const action = (overrides: Partial<SessionAction> = {}): SessionAction => ({
  action_id: 'session_action_000001',
  session_id: 'br_1',
  offer: { label: 'Deploy dash', type: 'deploy', repo_id: 12 },
  command: 'run `bash -l -c ./deploy.sh` in /repos/dash (repo-store repo 12, dash)',
  state: 'offered',
  offered_at: '2026-09-28T12:00:00Z',
  ...overrides,
})

describe('a session action in the chat', () => {
  it('can be pressed only while it waits for its one run', () => {
    expect(sessionActionIsConfirmable(action())).toBe(true)
    for (const state of ['running', 'succeeded', 'failed', 'outcome_unknown'] as const) {
      expect(sessionActionIsConfirmable(action({ state }))).toBe(false)
    }
  })

  it('names who pressed it, or the internal service when nobody was named', () => {
    expect(sessionActionRunBy(action({ run_by_principal_id: 'principal_000001' }))).toBe('principal_000001')
    expect(sessionActionRunBy(action())).toBe('the internal service')
  })

  it('says how each step went, with the reason a run failed', () => {
    expect(sessionActionStepText(action({ state: 'running', run_by_principal_id: 'principal_000001' }))).toBe(
      'Deploy dash — confirmed by principal_000001, running',
    )
    expect(sessionActionStepText(action({ state: 'succeeded' }))).toBe('Deploy dash — done')
    expect(sessionActionStepText(action({ state: 'failed', error: 'deploy.sh failed: exit status 1' }))).toBe(
      'Deploy dash — failed: deploy.sh failed: exit status 1',
    )
    expect(sessionActionStatusText(action({ state: 'outcome_unknown' }))).toBe('Outcome unknown')
  })
})
