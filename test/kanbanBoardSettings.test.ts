import { describe, expect, it } from 'vitest'
import type { Instance } from '@kayushkin/llm-bridge-types'
import {
  CLEAR_BUSINESS_HOURS_PATCH, CLEAR_CLASSIFIER_PATCH, boardBundleLabel, budgetDraftOfSeconds, businessHoursPatchOf,
  classifierDraftOf, classifierPatchOf, defaultsDraftOf, defaultsPatchOf, dispatchTargetForCard, generalDraftOf,
  generalPatchOf, ladderDraftOf, ladderDraftToWire, parseMailAccountIDs,
} from '../src/kanbanBoardSettings'
import type { Board, PriorityLadder } from '../src/types-kanban'
import type { Bundle } from '../src/types-bundles'

const board = (over: Partial<Board> = {}): Board => ({
  id: 'b1', name: 'Email', description: '', archived: false, created_at: '', updated_at: '', ...over,
})
const instance = (id: string, enabled = true): Instance =>
  ({ id, name: `name-${id}`, harness_type: 'claude_code', machine_id: 'm1', enabled }) as unknown as Instance

describe('a save sends only what changed', () => {
  it('general: an untouched field is not sent', () => {
    const stored = board({ name: 'Email', description: 'mail' })
    expect(generalPatchOf(stored, generalDraftOf(stored))).toEqual({})
    expect(generalPatchOf(stored, { ...generalDraftOf(stored), name: 'Inbox' })).toEqual({ name: 'Inbox' })
  })

  it('defaults: only the changed id goes out, so an untouched id is not re-checked with its owner', () => {
    const stored = board({ default_instance_id: 'inst-cc-local', default_bundle_id: '6' })
    const draft = defaultsDraftOf(stored)
    expect(defaultsPatchOf(stored, draft)).toEqual({})
    expect(defaultsPatchOf(stored, { ...draft, default_bundle_id: '7' })).toEqual({ default_bundle_id: '7' })
  })
})

describe('clearing', () => {
  it('a cleared default goes out as the empty string, the store’s own word for clear', () => {
    const stored = board({ default_principal_id: 'principal_000004', default_instance_id: 'inst-cc-local' })
    expect(defaultsPatchOf(stored, { ...defaultsDraftOf(stored), default_instance_id: '' })).toEqual({ default_instance_id: '' })
  })

  it('a switched-off classifier goes out as an empty object', () => {
    const stored = board({ classifier: { vocabulary: 'work', mail_account_ids: ['demo-work'], hold_new_cards: true } })
    expect(classifierPatchOf({ ...classifierDraftOf(stored), enabled: false })).toEqual({ classifier: {} })
    expect(CLEAR_CLASSIFIER_PATCH).toEqual({ classifier: {} })
  })

  it('cleared business hours go out as an empty object', () => {
    expect(CLEAR_BUSINESS_HOURS_PATCH).toEqual({ business_hours: {} })
  })
})

describe('classifier and business hours', () => {
  it('trims the vocabulary and sends the account list and hold flag as the store names them', () => {
    expect(classifierPatchOf({ enabled: true, vocabulary: ' work ', mailAccountIDs: [' demo-work ', ''], holdNewCards: true }))
      .toEqual({ classifier: { vocabulary: 'work', mail_account_ids: ['demo-work'], hold_new_cards: true } })
  })

  it('parses a typed account list on commas and whitespace, without repeats', () => {
    expect(parseMailAccountIDs('gmail-personal, imap-pretender\ngmail-personal')).toEqual(['gmail-personal', 'imap-pretender'])
  })

  it('sends days in weekday order whatever order they were ticked in', () => {
    expect(businessHoursPatchOf({ tzid: 'America/Los_Angeles', days: ['FR', 'MO', 'WE'], start: '09:00', end: '17:00' }))
      .toEqual({ business_hours: { tzid: 'America/Los_Angeles', days: ['MO', 'WE', 'FR'], start: '09:00', end: '17:00' } })
  })
})

describe('priority ladder', () => {
  it('converts hours and days to budget_seconds, and an empty budget to null', () => {
    const result = ladderDraftToWire([
      { label: 'P0', priorityValue: '5', budgetAmount: '2', budgetUnit: 'hours' },
      { label: 'P3', priorityValue: '2', budgetAmount: '7', budgetUnit: 'days' },
      { label: 'P4', priorityValue: '1', budgetAmount: '', budgetUnit: 'hours' },
    ])
    expect(result).toEqual({ ok: true, value: { levels: [
      { priority_value: 5, label: 'P0', budget_seconds: 7200 },
      { priority_value: 2, label: 'P3', budget_seconds: 604800 },
      { priority_value: 1, label: 'P4', budget_seconds: null },
    ] } })
  })

  it('shows a stored budget in whole days when it is one, in hours otherwise', () => {
    expect(budgetDraftOfSeconds(86400)).toEqual({ budgetAmount: '1', budgetUnit: 'days' })
    expect(budgetDraftOfSeconds(5400)).toEqual({ budgetAmount: '1.5', budgetUnit: 'hours' })
    expect(budgetDraftOfSeconds(null)).toEqual({ budgetAmount: '', budgetUnit: 'hours' })
  })

  it('round-trips the live ladder unchanged', () => {
    const ladder: PriorityLadder = { board_id: 'b1', levels: [
      { board_id: 'b1', priority_value: 5, label: 'P0', budget_seconds: 7200 },
      { board_id: 'b1', priority_value: 4, label: 'P1', budget_seconds: 28800 },
      { board_id: 'b1', priority_value: 1, label: 'P4', budget_seconds: 2592000 },
    ] }
    const result = ladderDraftToWire(ladderDraftOf(ladder))
    expect(result.ok && result.value.levels).toEqual(ladder.levels.map(({ board_id: _board, ...level }) => level))
  })

  it('refuses a priority that is not a whole number, naming the row, and leaves a zero rung to the store', () => {
    const bad = ladderDraftToWire([{ label: 'P0', priorityValue: 'high', budgetAmount: '', budgetUnit: 'hours' }])
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/row 1 \("P0"\)/)
    expect(ladderDraftToWire([{ label: 'P0', priorityValue: '0', budgetAmount: '', budgetUnit: 'hours' }]).ok).toBe(true)
  })
})

describe('where a dispatch runs when nobody chooses', () => {
  const instances = [instance('inst-a'), instance('inst-b'), instance('inst-off', false)]

  it('prefers the card’s last session’s instance over the board’s default', () => {
    const target = dispatchTargetForCard({ lastSessionInstanceID: 'inst-a', board: { default_instance_id: 'inst-b' }, instances })
    expect(target.kind).toBe('last-session')
    if (target.kind === 'last-session') expect(target.instance.id).toBe('inst-a')
  })

  it('uses the board’s default instance for a card with no session', () => {
    const target = dispatchTargetForCard({ lastSessionInstanceID: null, board: { default_instance_id: 'inst-b' }, instances })
    expect(target).toMatchObject({ kind: 'board-default', lastSessionNote: null })
    if (target.kind === 'board-default') expect(target.instance.id).toBe('inst-b')
  })

  it('falls to the board’s default when the last session’s instance is gone, and says why', () => {
    const target = dispatchTargetForCard({ lastSessionInstanceID: 'inst-gone', board: { default_instance_id: 'inst-b' }, instances })
    expect(target.kind).toBe('board-default')
    if (target.kind === 'board-default') expect(target.lastSessionNote).toMatch(/does not list/)
  })

  it('picks nothing when the board’s default is disabled, and says so', () => {
    const target = dispatchTargetForCard({ lastSessionInstanceID: null, board: { default_instance_id: 'inst-off' }, instances })
    expect(target.kind).toBe('none')
    if (target.kind === 'none') expect(target.why).toMatch(/disabled/)
  })

  it('picks nothing, with nothing to explain, when there is neither', () => {
    expect(dispatchTargetForCard({ lastSessionInstanceID: null, board: board(), instances })).toEqual({ kind: 'none', why: null })
  })
})

describe('the board’s bundle on a card', () => {
  const bundles = [{ id: 6, name: 'docker', display_name: 'Docker', enabled: true }] as unknown as Bundle[]

  it('is named from the bundle list, joined on the id', () => {
    expect(boardBundleLabel('6', bundles)).toBe('docker — Docker')
  })

  it('shows the raw id, never nothing, when the list lacks it or has not loaded', () => {
    expect(boardBundleLabel('9', bundles)).toBe('9')
    expect(boardBundleLabel('6', null)).toBe('6')
  })
})
