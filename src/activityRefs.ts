// What an activity reference chip shows, as pure rules so they are tested
// (test/activityRefs.test.ts). The chip is ActivityRefChip in
// components/chat/RefChip.tsx; its data is activity-store's answer to
// GET /activities/{id}, passed through by the host's resolver.

import type { Activity } from '@kayushkin/activity-store-types'
import { calendarDayOf } from './journalRefs'

/** The glyph an activity draws with, by the product it happened in. */
export function activityGlyph(product: string): string {
  switch (product) {
    case 'Search': case 'Image Search': case 'Video Search': case 'AI Mode': return '🔍'
    case 'YouTube': case 'Google TV': return '▶'
    case 'Maps': return '🗺'
    case 'Chrome': return '🌐'
    case 'Assistant': case 'Voice Match': return '🎙'
    case 'Gmail': return '✉'
    case 'Google Play Store': case 'Google Play Games': return '📱'
    case 'Flights': return '✈'
    default: return '🕘'
  }
}

/** The verb in words: the export's own ("Searched for"), else the action. */
export function activityVerb(activity: Pick<Activity, 'action' | 'action_text'>): string {
  if (activity.action_text) return activity.action_text
  return activity.action === 'other' ? '' : activity.action
}

/** An activity's name on a chip: what was searched, visited or watched;
 *  a purged one, whose words are gone, by its product and day. */
export function activityChipLabel(activity: Pick<Activity, 'title' | 'product' | 'occurred_at'>): string {
  if (activity.title) return activity.title
  return `${activity.product} ${calendarDayOf(activity.occurred_at)}`
}

/** Which sources saw it, each once, in the order they did. */
export function activitySources(activity: Pick<Activity, 'source' | 'sightings'>): string[] {
  const seen: string[] = []
  for (const sighting of activity.sightings ?? []) {
    if (!seen.includes(sighting.source)) seen.push(sighting.source)
  }
  if (seen.length === 0 && activity.source) seen.push(activity.source)
  return seen
}

/** A link worth following: only http and https. */
export function activityLink(url: string): string {
  return /^https?:\/\//i.test(url) ? url : ''
}
