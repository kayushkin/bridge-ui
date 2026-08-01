import type { TimelineBlock } from './types';
export declare const TIMELINE_WINDOW_INITIAL_ITEMS = 400;
export declare const TIMELINE_WINDOW_STEP_ITEMS = 800;
export declare function itemCountOfTimelineBlock(block: TimelineBlock): number;
/**
 * The index of the first block the Timeline pane renders. See
 * `windowStartIndex` for what the budget means; on the session measured above
 * the pane holds 2,178 items in 133 turn groups, so a group averages ~16
 * items and the block-level window has plenty of granularity.
 */
export declare function timelineWindowStart(blocks: TimelineBlock[], itemBudget: number): number;
/** How many items sit above the window — what the "show earlier" control counts. */
export declare function itemsBeforeTimelineWindow(blocks: TimelineBlock[], windowStart: number): number;
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
export declare function timelineBlockKey(block: TimelineBlock): string;
//# sourceMappingURL=timelineWindow.d.ts.map