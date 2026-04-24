import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
export function SplitResizer({ leftKey, rightKey, containerRef, setSizes }) {
    const [dragging, setDragging] = useState(false);
    const onPointerDown = useCallback((e) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container)
            return;
        const leftEl = container.querySelector(`[data-pane="${leftKey}"]`);
        const rightEl = container.querySelector(`[data-pane="${rightKey}"]`);
        if (!leftEl || !rightEl)
            return;
        const startX = e.clientX;
        const pairWidth = leftEl.getBoundingClientRect().width + rightEl.getBoundingClientRect().width;
        let startLeft = 0;
        let startRight = 0;
        setSizes(prev => { startLeft = prev[leftKey]; startRight = prev[rightKey]; return prev; });
        const totalGrow = startLeft + startRight;
        if (totalGrow <= 0 || pairWidth <= 0)
            return;
        const pixelsPerGrow = pairWidth / totalGrow;
        const MIN_PX = 180;
        const minGrow = Math.min(MIN_PX / pixelsPerGrow, totalGrow / 2);
        setDragging(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const growDelta = dx / pixelsPerGrow;
            let newLeft = startLeft + growDelta;
            let newRight = startRight - growDelta;
            if (newLeft < minGrow) {
                newLeft = minGrow;
                newRight = totalGrow - minGrow;
            }
            if (newRight < minGrow) {
                newRight = minGrow;
                newLeft = totalGrow - minGrow;
            }
            setSizes(prev => ({ ...prev, [leftKey]: newLeft, [rightKey]: newRight }));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setDragging(false);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [leftKey, rightKey, containerRef, setSizes]);
    const onDoubleClick = useCallback(() => {
        setSizes(prev => ({ ...prev, [leftKey]: 1, [rightKey]: 1 }));
    }, [leftKey, rightKey, setSizes]);
    return (_jsx("div", { className: `bc-split-resizer${dragging ? ' is-dragging' : ''}`, onPointerDown: onPointerDown, onDoubleClick: onDoubleClick, role: "separator", "aria-orientation": "vertical", title: "Drag to resize \u2014 double-click to reset" }));
}
//# sourceMappingURL=SplitResizer.js.map