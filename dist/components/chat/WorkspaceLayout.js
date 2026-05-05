import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useCallback, useRef, useState } from 'react';
export function WorkspaceLayout({ node, renderLeaf, onResize }) {
    return _jsx(LayoutNode, { node: node, path: [], renderLeaf: renderLeaf, onResize: onResize });
}
function LayoutNode({ node, path, renderLeaf, onResize }) {
    if (node.kind === 'leaf') {
        return _jsx(_Fragment, { children: renderLeaf(node.workspaceId) });
    }
    return _jsx(SplitNode, { node: node, path: path, renderLeaf: renderLeaf, onResize: onResize });
}
function SplitNode({ node, path, renderLeaf, onResize, }) {
    const containerRef = useRef(null);
    const className = `bc-workspace-split bc-workspace-split-${node.direction}`;
    return (_jsx("div", { ref: containerRef, className: className, children: node.children.map((child, i) => {
            const flex = node.sizes[i] ?? 1;
            return (_jsxs(Fragment, { children: [i > 0 && (_jsx(SplitResizer, { direction: node.direction, containerRef: containerRef, index: i, sizes: node.sizes, onCommit: (sizes) => onResize(path, sizes) })), _jsx("div", { className: "bc-workspace-split-child", style: { flex: `${flex} 1 0` }, children: _jsx(LayoutNode, { node: child, path: [...path, i], renderLeaf: renderLeaf, onResize: onResize }) })] }, `${i}`));
        }) }));
}
function SplitResizer({ direction, containerRef, index, sizes, onCommit }) {
    const [dragging, setDragging] = useState(false);
    const onPointerDown = useCallback((e) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container)
            return;
        const children = Array.from(container.children).filter(el => el.classList.contains('bc-workspace-split-child'));
        const leftEl = children[index - 1];
        const rightEl = children[index];
        if (!leftEl || !rightEl)
            return;
        const isHorizontal = direction === 'h';
        const startPos = isHorizontal ? e.clientX : e.clientY;
        const leftRect = leftEl.getBoundingClientRect();
        const rightRect = rightEl.getBoundingClientRect();
        const pairExtent = isHorizontal
            ? leftRect.width + rightRect.width
            : leftRect.height + rightRect.height;
        const startLeft = sizes[index - 1] ?? 1;
        const startRight = sizes[index] ?? 1;
        const totalGrow = startLeft + startRight;
        if (totalGrow <= 0 || pairExtent <= 0)
            return;
        const pixelsPerGrow = pairExtent / totalGrow;
        const MIN_PX = 180;
        const minGrow = Math.min(MIN_PX / pixelsPerGrow, totalGrow / 2);
        setDragging(true);
        document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        const onMove = (ev) => {
            const delta = (isHorizontal ? ev.clientX : ev.clientY) - startPos;
            const growDelta = delta / pixelsPerGrow;
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
            const next = sizes.slice();
            next[index - 1] = newLeft;
            next[index] = newRight;
            onCommit(next);
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
    }, [containerRef, direction, index, sizes, onCommit]);
    const onDoubleClick = useCallback(() => {
        const next = sizes.slice();
        next[index - 1] = 1;
        next[index] = 1;
        onCommit(next);
    }, [sizes, index, onCommit]);
    const isHorizontal = direction === 'h';
    return (_jsx("div", { className: `bc-workspace-resizer bc-workspace-resizer-${direction}${dragging ? ' is-dragging' : ''}`, onPointerDown: onPointerDown, onDoubleClick: onDoubleClick, role: "separator", "aria-orientation": isHorizontal ? 'vertical' : 'horizontal', title: "Drag to resize \u2014 double-click to reset" }));
}
//# sourceMappingURL=WorkspaceLayout.js.map