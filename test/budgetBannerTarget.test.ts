import { describe, expect, it } from 'vitest'
import { budgetBannerTarget } from '../src/components/chat/budgetBannerTarget'
import type { ProducerConfig } from '../src/components/chat/ProducerRow'

const producer: ProducerConfig = {
  enabled: true,
  week_limit_usd: 50,
  week_spent_usd: 58.5,
  week_remaining_usd: 0,
  week_start: '2026-10-19T00:00:00Z',
  week_resets_at: '2026-10-26T00:00:00Z',
  home_session_id: 'br_home',
}
const session = { maxBudgetUSD: 86.96, spendUSD: 86.96 }

describe('budgetBannerTarget', () => {
  it('edits the weekly limit on the session the producer names as its home', () => {
    expect(budgetBannerTarget('br_home', producer, session)).toEqual({
      kind: 'weekly-limit', current: 50, spent: 58.5, resetsAt: '2026-10-26T00:00:00Z',
    })
  })

  it('edits the session ceiling on any other session', () => {
    expect(budgetBannerTarget('br_other', producer, session)).toEqual({
      kind: 'session-ceiling', current: 86.96, spent: 86.96,
    })
  })

  it('edits the session ceiling when the producer has not answered', () => {
    expect(budgetBannerTarget('br_home', null, session).kind).toBe('session-ceiling')
  })
})
