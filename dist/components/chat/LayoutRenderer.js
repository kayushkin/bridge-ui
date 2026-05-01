import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
import { GitPanel } from '../GitPanel';
import { SplitResizer } from './SplitResizer';
import { Thread } from './Thread';
import { Timeline } from './Timeline';
import { TurnsView } from './TurnsView';
import { useWorkspace } from './WorkspaceContext';
function hasVisibleLeaf(node, hidden) {
    if (node.kind === 'leaf')
        return !hidden.has(node.viewType);
    return node.children.some(c => hasVisibleLeaf(c, hidden));
}
function ViewLeaf({ viewType, style }) {
    const ws = useWorkspace();
    const sessionId = ws.chat?.sessionId ?? '';
    const agent = ws.chat?.agent ?? '';
    switch (viewType) {
        case 'turns':
            return (_jsx(TurnsView, { rows: ws.rows, agent: agent, onToggleCollapse: () => ws.togglePane('turns'), style: style, paneKey: "turns" }));
        case 'thread':
            return (_jsxs("div", { className: "bc-split-pane bc-split-pane-thread", style: style, "data-pane": "thread", children: [_jsxs("div", { className: "bc-split-pane-header bc-header-clickable", onClick: () => ws.togglePane('thread'), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            ws.togglePane('thread');
                        } }, role: "button", tabIndex: 0, title: "Hide thread", "aria-label": "Hide thread", children: [_jsx("span", { className: "bc-split-pane-title", children: "Thread" }), _jsx("span", { className: "bc-spacer" }), _jsx("span", { className: "bc-split-collapse-btn", "aria-hidden": "true", children: "\u00D7" })] }), _jsx(Thread, { rows: ws.rows, loading: ws.loading, error: ws.error, agent: agent, sessionId: sessionId, onResolveHook: ws.resolveHook })] }));
        case 'timeline':
            return (_jsx(Timeline, { rows: ws.rows, onToggleCollapse: () => ws.togglePane('timeline'), style: style, paneKey: "timeline" }));
        case 'git':
            return (_jsx(GitPanel, { sessionId: sessionId, uiState: ws.uiState, onToggleCollapse: () => ws.togglePane('git'), style: style, paneKey: "git" }));
    }
}
function SplitView({ node, hidden }) {
    const ws = useWorkspace();
    const containerRef = useRef(null);
    const visibleChildren = node.children.filter(c => hasVisibleLeaf(c, hidden));
    if (visibleChildren.length === 0)
        return null;
    // Resizers operate on direct PaneKey leaves only. Nested-split resizing
    // arrives in a later phase; for now non-leaf siblings render without a
    // resizable boundary.
    const directLeafKey = (n) => (n.kind === 'leaf' ? n.viewType : null);
    const styleFor = (n) => {
        const k = directLeafKey(n);
        if (k)
            return { flex: `${ws.paneSizes[k]} 1 0` };
        return { flex: '1 1 0' };
    };
    const className = `bc-chat-split bc-chat-split-${node.direction}`;
    const nodes = [];
    visibleChildren.forEach((child, i) => {
        if (i > 0 && node.direction === 'h') {
            const leftKey = directLeafKey(visibleChildren[i - 1]);
            const rightKey = directLeafKey(child);
            if (leftKey && rightKey) {
                nodes.push(_jsx(SplitResizer, { leftKey: leftKey, rightKey: rightKey, containerRef: containerRef, setSizes: ws.setPaneSizes }, `resizer-${leftKey}-${rightKey}`));
            }
        }
        if (child.kind === 'leaf') {
            nodes.push(_jsx(ViewLeaf, { viewType: child.viewType, style: styleFor(child) }, `leaf-${child.viewType}`));
        }
        else {
            nodes.push(_jsx(SplitView, { node: child, hidden: hidden }, `split-${i}`));
        }
    });
    return _jsx("div", { ref: containerRef, className: className, style: styleFor(node), children: nodes });
}
export function LayoutRenderer({ tree }) {
    const ws = useWorkspace();
    const hidden = new Set();
    if (ws.panesHidden.turns)
        hidden.add('turns');
    if (ws.panesHidden.thread)
        hidden.add('thread');
    if (ws.panesHidden.timeline)
        hidden.add('timeline');
    if (ws.panesHidden.git)
        hidden.add('git');
    if (!hasVisibleLeaf(tree, hidden)) {
        return (_jsx("div", { className: "bc-chat-split", children: _jsx("div", { className: "bc-split-empty", children: _jsx("div", { className: "bc-split-empty-hint", children: "All panes hidden. Use the toggles above to show Turns, Thread, Timeline, or Git." }) }) }));
    }
    if (tree.kind === 'leaf') {
        return _jsx(ViewLeaf, { viewType: tree.viewType });
    }
    return _jsx(SplitView, { node: tree, hidden: hidden });
}
//# sourceMappingURL=LayoutRenderer.js.map