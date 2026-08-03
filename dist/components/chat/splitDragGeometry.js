// The arithmetic behind dragging a split boundary, kept free of React and the
// DOM so `npm run check` can pin it directly.
//
// A split lays its children out with `flex: <grow> 1 0`, so a pane's on-screen
// extent is its grow number's share of the pair's combined extent. Dragging the
// boundary moves pixels; what has to be written back is grow numbers. Every
// value named `...GrowUnits` is in that flex-grow space, every value named
// `...Pixels` is in screen space, and `pixelsPerGrowUnit` is the only bridge
// between them.
/** No drag may leave either side of a boundary narrower than this. */
export const MINIMUM_PANE_PIXELS = 180;
/**
 * Measure a boundary at the moment a drag starts. Returns null when the pair
 * cannot be resized — a zero combined grow or a pair with no extent on screen
 * gives no scale to convert pixels with.
 */
export function measureSplitDragGeometry(pairExtentPixels, startGrowUnitsBefore, startGrowUnitsAfter) {
    const totalGrowUnits = startGrowUnitsBefore + startGrowUnitsAfter;
    if (totalGrowUnits <= 0 || pairExtentPixels <= 0)
        return null;
    const pixelsPerGrowUnit = pairExtentPixels / totalGrowUnits;
    return {
        pixelsPerGrowUnit,
        totalGrowUnits,
        minimumGrowUnits: Math.min(MINIMUM_PANE_PIXELS / pixelsPerGrowUnit, totalGrowUnits / 2),
        startGrowUnitsBefore,
        startGrowUnitsAfter,
    };
}
/**
 * The grow numbers a pointer that has travelled `pointerDeltaPixels` from where
 * the drag started should produce. The pair's total is conserved, so the two
 * returned values always sum to `totalGrowUnits`.
 */
export function splitGrowUnitsAfterDrag(geometry, pointerDeltaPixels) {
    const { minimumGrowUnits, pixelsPerGrowUnit, totalGrowUnits } = geometry;
    const growUnitsDelta = pointerDeltaPixels / pixelsPerGrowUnit;
    let growUnitsBefore = geometry.startGrowUnitsBefore + growUnitsDelta;
    let growUnitsAfter = geometry.startGrowUnitsAfter - growUnitsDelta;
    if (growUnitsBefore < minimumGrowUnits) {
        growUnitsBefore = minimumGrowUnits;
        growUnitsAfter = totalGrowUnits - minimumGrowUnits;
    }
    if (growUnitsAfter < minimumGrowUnits) {
        growUnitsAfter = minimumGrowUnits;
        growUnitsBefore = totalGrowUnits - minimumGrowUnits;
    }
    return { growUnitsBefore, growUnitsAfter };
}
/** Both sides of a boundary reset to an even share. What double-click writes. */
export const EVEN_SPLIT_GROW_UNITS = { growUnitsBefore: 1, growUnitsAfter: 1 };
//# sourceMappingURL=splitDragGeometry.js.map