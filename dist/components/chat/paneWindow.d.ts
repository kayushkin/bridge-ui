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
export declare function windowStartIndex<Block>(blocks: Block[], budget: number, sizeOf: (block: Block) => number): number;
/** How many units sit above the window — what the "show earlier" control counts. */
export declare function unitsBeforeWindow<Block>(blocks: Block[], windowStart: number, sizeOf: (block: Block) => number): number;
//# sourceMappingURL=paneWindow.d.ts.map