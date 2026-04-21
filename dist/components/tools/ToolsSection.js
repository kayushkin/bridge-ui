import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import ToolItem from './ToolItem';
export default function ToolsSection({ tools, turnDone }) {
    const [collapsed, setCollapsed] = useState(true);
    const prevTurnDone = useRef(turnDone);
    useEffect(() => {
        if (turnDone && !prevTurnDone.current)
            setCollapsed(true);
        prevTurnDone.current = turnDone;
    }, [turnDone]);
    return (_jsxs("div", { className: `bc-tools-section${collapsed ? ' bc-tools-section-collapsed' : ''}`, children: [_jsxs("button", { type: "button", className: "bc-tools-section-header", onClick: () => setCollapsed(c => !c), children: [_jsx("span", { className: "bc-tools-section-chevron", children: collapsed ? '▸' : '▾' }), _jsxs("span", { children: ["Tools (", tools.length, ")"] })] }), !collapsed && (_jsx("div", { className: "bc-msg-tools", children: tools.map((t, ti) => (_jsx(ToolItem, { tool: t, running: false, turnDone: turnDone }, ti))) }))] }));
}
//# sourceMappingURL=ToolsSection.js.map