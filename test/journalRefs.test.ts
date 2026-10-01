import { describe, expect, it } from 'vitest'
import { calendarDayOf, entryChipLabel, hostPageHref } from '../src/journalRefs'

describe('entryChipLabel', () => {
  it('uses the title when there is one', () => {
    expect(entryChipLabel({ title: 'Lake trip', kind: 'post', written_at: 1 })).toBe('Lake trip')
  })
  it('names an untitled journal entry by its day', () => {
    const writtenAt = new Date(2026, 9, 1, 12).getTime() / 1000
    expect(entryChipLabel({ title: '  ', kind: 'journal', written_at: writtenAt })).toBe('journal 2026-10-01')
  })
})

describe('calendarDayOf', () => {
  it('gives empty for an unset timestamp', () => {
    expect(calendarDayOf(0)).toBe('')
  })
})

describe('hostPageHref', () => {
  it('links to the host page with the id escaped', () => {
    expect(hostPageHref('/people', 'person_000001')).toBe('/people?id=person_000001')
  })
  it('gives no link when the host has no page', () => {
    expect(hostPageHref('', 'person_000001')).toBe('')
  })
})
