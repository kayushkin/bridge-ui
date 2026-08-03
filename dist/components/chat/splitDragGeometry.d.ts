/** No drag may leave either side of a boundary narrower than this. */
export declare const MINIMUM_PANE_PIXELS = 180;
export interface SplitDragGeometry {
    /** Screen extent of one flex-grow unit, measured when the drag started. */
    pixelsPerGrowUnit: number;
    /** The pair's combined grow, which a drag redistributes but never changes. */
    totalGrowUnits: number;
    /** MINIMUM_PANE_PIXELS in grow units, capped at half the pair so a pair too
     *  small to honour the minimum splits evenly instead of inverting. */
    minimumGrowUnits: number;
    startGrowUnitsBefore: number;
    startGrowUnitsAfter: number;
}
/**
 * Measure a boundary at the moment a drag starts. Returns null when the pair
 * cannot be resized — a zero combined grow or a pair with no extent on screen
 * gives no scale to convert pixels with.
 */
export declare function measureSplitDragGeometry(pairExtentPixels: number, startGrowUnitsBefore: number, startGrowUnitsAfter: number): SplitDragGeometry | null;
export interface SplitGrowUnits {
    growUnitsBefore: number;
    growUnitsAfter: number;
}
/**
 * The grow numbers a pointer that has travelled `pointerDeltaPixels` from where
 * the drag started should produce. The pair's total is conserved, so the two
 * returned values always sum to `totalGrowUnits`.
 */
export declare function splitGrowUnitsAfterDrag(geometry: SplitDragGeometry, pointerDeltaPixels: number): SplitGrowUnits;
/** Both sides of a boundary reset to an even share. What double-click writes. */
export declare const EVEN_SPLIT_GROW_UNITS: SplitGrowUnits;
//# sourceMappingURL=splitDragGeometry.d.ts.map