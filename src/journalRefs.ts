// What a person or journal-entry reference chip shows, as pure rules so they
// are tested (test/journalRefs.test.ts). The chips themselves are PersonRefChip
// and EntryRefChip in components/chat/RefChip.tsx; their data is the store's
// own answer, passed through by the host's resolver.

import type { Entry } from '@kayushkin/journal-store-types'

/** The calendar day of an epoch-seconds timestamp, in the reader's time zone,
 *  as YYYY-MM-DD. 0 means unset in every store here, so it gives ''. */
export function calendarDayOf(epochSeconds: number): string {
  if (!epochSeconds) return ''
  const date = new Date(epochSeconds * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** An entry's name on a chip. journal-store requires a title for every kind
 *  but `journal`, so an untitled entry is a journal entry and is named by the
 *  day it was written. */
export function entryChipLabel(entry: Pick<Entry, 'title' | 'kind' | 'written_at'>): string {
  if (entry.title.trim() !== '') return entry.title
  return `${entry.kind} ${calendarDayOf(entry.written_at)}`.trim()
}

/** Where a host page shows one record: `{pagePath}?id=<id>`, or '' when the
 *  host has no such page, so no link points nowhere. */
export function hostPageHref(pagePath: string, id: string): string {
  return pagePath ? `${pagePath}?id=${encodeURIComponent(id)}` : ''
}
