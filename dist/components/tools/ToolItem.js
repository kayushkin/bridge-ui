import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { getToolRenderer } from './registry';
import DefaultRenderer from './DefaultRenderer';
export default function ToolItem({ tool, running, turnDone = false }) {
    const Renderer = getToolRenderer(tool.tool) ?? DefaultRenderer;
    const [collapsed, setCollapsed] = useState(true);
    const prevTurnDone = useRef(turnDone);
    useEffect(() => {
        if (turnDone && !prevTurnDone.current)
            setCollapsed(true);
        prevTurnDone.current = turnDone;
    }, [turnDone]);
    const cls = `bc-tool-wrap bc-tool-collapsible${collapsed ? ' bc-tool-collapsed' : ''}`;
    return (_jsx("div", { className: cls, onClick: () => setCollapsed(c => !c), children: _jsx(Renderer, { tool: tool, running: running }) }));
}
//# sourceMappingURL=ToolItem.js.map