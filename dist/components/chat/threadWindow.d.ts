import type { TurnBlock } from './types';
export declare const THREAD_WINDOW_INITIAL_ROWS = 400;
export declare const THREAD_WINDOW_STEP_ROWS = 800;
export declare function rowCountOfBlock(block: TurnBlock): number;
/**
 * The index of the first block the Thread pane renders, counting rows back
 * from the newest block until `rowBudget` is met.
 *
 * A block is never split. A turn header states how many events its turn
 * holds, so rendering half a turn would make that count a lie — and the rows
 * inside one turn are what the reader is comparing against each other. So the
 * pane renders at most `rowBudget` rows plus the whole of the block that
 * crossed it. On the session measured above the largest single turn is 438
 * rows, which is the worst that overshoot gets there.
 *
 * An infinite budget returns 0, which is the un-windowed pane.
 */
export declare function threadWindowStart(blocks: TurnBlock[], rowBudget: number): number;
/** How many rows sit above the window — what the "show earlier" control counts. */
export declare function rowsBeforeWindow(blocks: TurnBlock[], windowStart: number): number;
/**
 * A stable identity for a block, used to hold the top of the window still
 * while the user is scrolled up.
 *
 * Deliberately not the React key: Thread's keys carry the render index as a
 * tiebreak, and an index is the one part of a block's identity that moves when
 * the list around it does — which is exactly the case this is here to survive.
 *
 * A turn is named by its id AND its first row, not by its id alone.
 * `groupRowsByTurn` groups CONSECUTIVE rows, so a turn interrupted by a row
 * carrying no turn id becomes two blocks with the same turn id; the first row
 * is what tells them apart. It is as stable as the turn id — the reducer
 * appends rows and replaces them in place, and never inserts one before an
 * existing one — so this stays fixed while the turn grows.
 */
export declare function threadBlockKey(block: TurnBlock): string;
//# sourceMappingURL=threadWindow.d.ts.map