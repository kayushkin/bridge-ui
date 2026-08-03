import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useRef } from 'react';
import { SplitDragHandle } from './SplitDragHandle';
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
    // The children of this split, in DOM order. The container also holds the
    // resizer elements, so a class filter is what separates panes from handles.
    const paneElements = () => {
        const container = containerRef.current;
        if (!container)
            return [];
        return Array.from(container.children).filter(element => element.classList.contains('bc-workspace-split-child'));
    };
    return (_jsx("div", { ref: containerRef, className: className, children: node.children.map((child, i) => {
            const flex = node.sizes[i] ?? 1;
            return (_jsxs(Fragment, { children: [i > 0 && (_jsx(SplitDragHandle, { axis: node.direction === 'h' ? 'horizontal' : 'vertical', className: `bc-workspace-resizer bc-workspace-resizer-${node.direction}`, resolveDraggedPair: () => {
                            const panes = paneElements();
                            const elementBefore = panes[i - 1];
                            const elementAfter = panes[i];
                            if (!elementBefore || !elementAfter)
                                return null;
                            return {
                                elementBefore,
                                elementAfter,
                                growUnitsBefore: node.sizes[i - 1] ?? 1,
                                growUnitsAfter: node.sizes[i] ?? 1,
                            };
                        }, commitGrowUnits: ({ growUnitsBefore, growUnitsAfter }) => {
                            const sizes = node.sizes.slice();
                            sizes[i - 1] = growUnitsBefore;
                            sizes[i] = growUnitsAfter;
                            onResize(path, sizes);
                        } })), _jsx("div", { className: "bc-workspace-split-child", style: { flex: `${flex} 1 0` }, children: _jsx(LayoutNode, { node: child, path: [...path, i], renderLeaf: renderLeaf, onResize: onResize }) })] }, `${i}`));
        }) }));
}
//# sourceMappingURL=WorkspaceLayout.js.map