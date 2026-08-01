// The windowing arithmetic the long chat panes share.
//
// Thread and Timeline both render one chronological, append-only list that is
// read from the bottom, and both are large enough on a real session that
// mounting the whole of it costs more than the part anybody looks at. Both
// therefore render a suffix of their list and leave the rest one press away.
//
// Neither pane puts a spacer of estimated height above its window, which is
// what keeps this small: there are no heights to estimate, the rendered
// content's height stays real, and `useStickyBottomScroll` needs no changes.
// The price is two pieces of bookkeeping, and they are what the callers own —
// restoring the distance from the bottom when earlier blocks are revealed
// (`usePaneWindowBudget`) and freezing the window while the user is scrolled
// up (the block key each pane defines).
//
// The functions here are about counts inside blocks, so they say nothing
// about what a block is. Each pane supplies its own `sizeOf`: Thread counts
// log rows, Timeline counts timeline items.
/**
 * The index of the first block a pane renders, counting units back from the
 * newest block until `budget` is met.
 *
 * A block is never split. A turn header states how many events its turn
 * holds, so rendering half a turn would make that count a lie — and the units
 * inside one turn are what the reader is comparing against each other. So a
 * pane renders at most `budget` units plus the whole of the block that
 * crossed it.
 *
 * An infinite budget returns 0, which is the un-windowed pane.
 */
export function windowStartIndex(blocks, budget, sizeOf) {
    if (blocks.length === 0)
        return 0;
    let counted = 0;
    for (let i = blocks.length - 1; i > 0; i--) {
        counted += sizeOf(blocks[i]);
        if (counted >= budget)
            return i;
    }
    return 0;
}
/** How many units sit above the window — what the "show earlier" control counts. */
export function unitsBeforeWindow(blocks, windowStart, sizeOf) {
    let counted = 0;
    for (let i = 0; i < windowStart && i < blocks.length; i++)
        counted += sizeOf(blocks[i]);
    return counted;
}
//# sourceMappingURL=paneWindow.js.map