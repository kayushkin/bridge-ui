// The Conversations composer's emoji picker: which emoji a search shows, and
// how a picked one goes into the text box. The table itself is
// src/emojiData.ts, generated from Unicode's data and loaded only when the
// picker first opens.

export interface EmojiGroup {
  name: string
  emojis: readonly (readonly [string, string])[]
}

/** The groups whose emoji match every word of the query somewhere in their
 *  Unicode name, each group keeping only its matches; every group whole for
 *  an empty query. An emoji typed into the search matches itself. */
export function searchEmoji(groups: readonly EmojiGroup[], query: string): EmojiGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...groups]
  return groups
    .map(group => ({
      name: group.name,
      emojis: group.emojis.filter(([emoji, name]) => words.every(word => name.includes(word) || emoji === word)),
    }))
    .filter(group => group.emojis.length > 0)
}

/** The draft with `insert` put in place of the selection, and where the cursor
 *  goes: just after what went in. A selection past the end (the draft changed
 *  under it) is clamped to the end. */
export function insertAtSelection(draft: string, selectionStart: number, selectionEnd: number, insert: string): { text: string; cursor: number } {
  const start = Math.min(Math.max(0, selectionStart), draft.length)
  const end = Math.min(Math.max(start, selectionEnd), draft.length)
  return { text: draft.slice(0, start) + insert + draft.slice(end), cursor: start + insert.length }
}
