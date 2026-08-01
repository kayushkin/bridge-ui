import { unitsBeforeWindow, windowStartIndex } from './paneWindow'
import type { TimelineBlock } from './types'

// How many timeline items the Timeline pane renders before it stops and
// leaves the rest behind a button, and how many more each press reveals.
//
// Measured with `npm run pane-cost` on the largest session on this host
// (br_1785171126409277953 — 13,105 events, 11,968 log rows) once Thread was
// windowed: Timeline holds 11,510 elements and 2,386 KB of markup, three
// times Thread's 3,773 and more than ten times its markup. Before Thread was
// windowed Timeline was the small pane and this did not matter.
//
// The rows here are one line each, so a screen holds more of them than it
// holds Thread rows — 400 items is several screens at any font size, which is
// the property that matters: the first press of the mouse wheel must not find
// the end of the window. The same numbers as Thread, counting a different
// unit; they are not one constant because a timeline item and a log row are
// not the same amount of pane.
export const TIMELINE_WINDOW_INITIAL_ITEMS = 400
export const TIMELINE_WINDOW_STEP_ITEMS = 800

export function itemCountOfTimelineBlock(block: TimelineBlock): number {
  return block.kind === 'turn' ? block.items.length : 1
}

/**
 * The index of the first block the Timeline pane renders. See
 * `windowStartIndex` for what the budget means; on the session measured above
 * the pane holds 2,178 items in 133 turn groups, so a group averages ~16
 * items and the block-level window has plenty of granularity.
 */
export function timelineWindowStart(blocks: TimelineBlock[], itemBudget: number): number {
  return windowStartIndex(blocks, itemBudget, itemCountOfTimelineBlock)
}

/** How many items sit above the window — what the "show earlier" control counts. */
export function itemsBeforeTimelineWindow(blocks: TimelineBlock[], windowStart: number): number {
  return unitsBeforeWindow(blocks, windowStart, itemCountOfTimelineBlock)
}

/**
 * A stable identity for a block, used both as the React key and to hold the
 * top of the window still while the user is scrolled up.
 *
 * A turn is named by its id AND its first item, not by its id alone.
 * `groupTimelineByTurn` groups CONSECUTIVE items, so a turn interrupted by an
 * item carrying no turn id becomes two blocks with the same turn id; the first
 * item is what tells them apart. It is as stable as the turn id — item keys
 * are derived from log-row keys, and the reducer appends rows and replaces
 * them in place, never inserting one before an existing one — so this stays
 * fixed while the turn grows.
 *
 * This replaces a key built from the block's index into the item list, which
 * moved whenever anything earlier in the session did.
 */
export function timelineBlockKey(block: TimelineBlock): string {
  return block.kind === 'turn'
    ? `tg_${block.turnId}_${block.items[0]?.key ?? ''}`
    : `ti_${block.item.key}`
}
