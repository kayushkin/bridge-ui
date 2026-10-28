import { describe, expect, it } from 'vitest'
import { activityChipLabel, activityGlyph, activityLink, activitySources, activityVerb } from '../src/activityRefs'

describe('activity chips', () => {
  it('draws a glyph by product', () => {
    expect(activityGlyph('Search')).toBe('🔍')
    expect(activityGlyph('YouTube')).toBe('▶')
    expect(activityGlyph('Some New Product')).toBe('🕘')
  })
  it('says the verb in the export’s words, else the action', () => {
    expect(activityVerb({ action: 'searched', action_text: 'Searched for' })).toBe('Searched for')
    expect(activityVerb({ action: 'viewed', action_text: '' })).toBe('viewed')
    expect(activityVerb({ action: 'other', action_text: '' })).toBe('')
  })
  it('names an activity by its title, or a purged one by product and day', () => {
    expect(activityChipLabel({ title: 'sourdough starter', product: 'Search', occurred_at: 1300000000 })).toBe('sourdough starter')
    expect(activityChipLabel({ title: '', product: 'Search', occurred_at: 1300000000 })).toMatch(/^Search 2011-03-1[23]$/)
  })
  it('lists each source once', () => {
    const sighting = (source: string) => ({ source, source_ref: 'r', product: 'YouTube', action: 'watched', import_id: 'import_000001', occurred_at: 1, seen_at: 1 })
    expect(activitySources({ source: 'google_my_activity', sightings: [sighting('google_my_activity'), sighting('youtube_history'), sighting('youtube_history')] }))
      .toEqual(['google_my_activity', 'youtube_history'])
    expect(activitySources({ source: 'chrome_history', sightings: [] })).toEqual(['chrome_history'])
  })
  it('links only http and https', () => {
    expect(activityLink('https://example.com/a')).toBe('https://example.com/a')
    expect(activityLink('javascript:alert(1)')).toBe('')
    expect(activityLink('')).toBe('')
  })
})
