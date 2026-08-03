import type { SplitGrowUnits } from './splitDragGeometry';
/**
 * The one draggable boundary between two panes of a split.
 *
 * It owns the pointer handling and the body-level drag state; where the two
 * panes live and where their sizes are stored is the caller's business, passed
 * in as `resolveDraggedPair` and `commitGrowUnits`. That is the whole reason
 * this is parameterized: the outer workspace split keys its panes by index into
 * a sizes array on a layout tree, the inner view split keys them by `PaneKey`
 * into a record, and neither needs its own copy of the arithmetic.
 */
export interface DraggedSplitPair {
    /** The pane on the left of a horizontal split, or above a vertical one. */
    elementBefore: HTMLElement;
    elementAfter: HTMLElement;
    growUnitsBefore: number;
    growUnitsAfter: number;
}
export interface SplitDragHandleProps {
    /** How the split lays its children out: side by side, or stacked. */
    axis: 'horizontal' | 'vertical';
    /** Class for the handle element. The two splits are styled separately. */
    className: string;
    /** Read the pair at the moment the drag starts; null if it cannot be found. */
    resolveDraggedPair: () => DraggedSplitPair | null;
    /** Write new sizes back wherever the caller keeps them. Called per move. */
    commitGrowUnits: (growUnits: SplitGrowUnits) => void;
}
export declare function SplitDragHandle({ axis, className, resolveDraggedPair, commitGrowUnits, }: SplitDragHandleProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SplitDragHandle.d.ts.map