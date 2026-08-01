// How many log rows the Thread pane renders before it stops and leaves the
// rest behind a button, and how many more each press reveals.
//
// Measured with `npm run pane-cost` on the largest session on this host
// (br_1785171126409277953 — 13,105 events, 11,968 rows, 1,984 blocks): the
// whole log is 80,606 elements and 4,440 KB of markup, an order of magnitude
// more than either other pane. The log is chronological and append-only and
// the pane is read from the bottom, so on open the only rows on screen are
// the newest ones; every element above them is mounted to be scrolled past.
//
// 400 is far more than one screen holds at any font size, so the first press
// of the mouse wheel never finds the end of the window.
export const THREAD_WINDOW_INITIAL_ROWS = 400;
export const THREAD_WINDOW_STEP_ROWS = 800;
export function rowCountOfBlock(block) {
    return block.kind === 'turn' ? block.rows.length : 1;
}
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
export function threadWindowStart(blocks, rowBudget) {
    if (blocks.length === 0)
        return 0;
    let rows = 0;
    for (let i = blocks.length - 1; i > 0; i--) {
        rows += rowCountOfBlock(blocks[i]);
        if (rows >= rowBudget)
            return i;
    }
    return 0;
}
/** How many rows sit above the window — what the "show earlier" control counts. */
export function rowsBeforeWindow(blocks, windowStart) {
    let rows = 0;
    for (let i = 0; i < windowStart && i < blocks.length; i++)
        rows += rowCountOfBlock(blocks[i]);
    return rows;
}
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
export function threadBlockKey(block) {
    return block.kind === 'turn'
        ? `turn_${block.turnId}_${block.rows[0]?.key ?? ''}`
        : `row_${block.row.key}`;
}
//# sourceMappingURL=threadWindow.js.map