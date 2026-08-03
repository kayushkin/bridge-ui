import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { EVEN_SPLIT_GROW_UNITS, measureSplitDragGeometry, splitGrowUnitsAfterDrag, } from './splitDragGeometry';
export function SplitDragHandle({ axis, className, resolveDraggedPair, commitGrowUnits, }) {
    const [dragging, setDragging] = useState(false);
    const laidOutSideBySide = axis === 'horizontal';
    const onPointerDown = useCallback((event) => {
        event.preventDefault();
        const pair = resolveDraggedPair();
        if (!pair)
            return;
        const startPointerPixels = laidOutSideBySide ? event.clientX : event.clientY;
        const rectBefore = pair.elementBefore.getBoundingClientRect();
        const rectAfter = pair.elementAfter.getBoundingClientRect();
        const pairExtentPixels = laidOutSideBySide
            ? rectBefore.width + rectAfter.width
            : rectBefore.height + rectAfter.height;
        const geometry = measureSplitDragGeometry(pairExtentPixels, pair.growUnitsBefore, pair.growUnitsAfter);
        if (!geometry)
            return;
        setDragging(true);
        document.body.style.cursor = laidOutSideBySide ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        const onPointerMove = (moveEvent) => {
            const pointerPixels = laidOutSideBySide ? moveEvent.clientX : moveEvent.clientY;
            commitGrowUnits(splitGrowUnitsAfterDrag(geometry, pointerPixels - startPointerPixels));
        };
        const onPointerRelease = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerRelease);
            window.removeEventListener('pointercancel', onPointerRelease);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setDragging(false);
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerRelease);
        window.addEventListener('pointercancel', onPointerRelease);
    }, [laidOutSideBySide, resolveDraggedPair, commitGrowUnits]);
    const onDoubleClick = useCallback(() => {
        commitGrowUnits(EVEN_SPLIT_GROW_UNITS);
    }, [commitGrowUnits]);
    return (_jsx("div", { className: `${className}${dragging ? ' is-dragging' : ''}`, onPointerDown: onPointerDown, onDoubleClick: onDoubleClick, role: "separator", "aria-orientation": laidOutSideBySide ? 'vertical' : 'horizontal', title: "Drag to resize \u2014 double-click to reset" }));
}
//# sourceMappingURL=SplitDragHandle.js.map