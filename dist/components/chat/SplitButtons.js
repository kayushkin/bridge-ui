import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
const DIRECTIONS = [
    { mode: 'split-up', glyph: '↑', title: 'Split above focused pane', cell: 'up' },
    { mode: 'split-left', glyph: '←', title: 'Split left of focused pane', cell: 'left' },
    { mode: 'split-right', glyph: '→', title: 'Split right of focused pane', cell: 'right' },
    { mode: 'split-down', glyph: '↓', title: 'Split below focused pane', cell: 'down' },
];
export function SplitButtons({ onSplit, active, size = 'sm', autoTitle = 'Split focused pane (auto direction)', chooseTitle = 'Choose split direction', }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const onDoc = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target))
                setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        window.addEventListener('mousedown', onDoc);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDoc);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const sizeClass = size === 'md' ? 'bc-split-btns-md' : 'bc-split-btns-sm';
    const directionalActive = DIRECTIONS.some(d => d.mode === active);
    return (_jsxs("span", { ref: wrapRef, className: `bc-split-btns ${sizeClass}`, onClick: e => e.stopPropagation(), children: [_jsx("button", { type: "button", className: `bc-split-btn bc-split-btn-auto ${active === 'split-auto' ? 'bc-split-btn-active' : ''}`, title: autoTitle, "aria-label": autoTitle, onClick: () => onSplit('split-auto'), children: "\u229E" }), _jsx("button", { type: "button", className: `bc-split-btn bc-split-btn-choose ${directionalActive ? 'bc-split-btn-active' : ''}`, title: chooseTitle, "aria-label": chooseTitle, "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen(o => !o), children: "\u25BE" }), open && (_jsx("span", { className: "bc-split-popover", role: "menu", children: _jsxs("span", { className: "bc-split-popover-grid", children: [DIRECTIONS.map(d => (_jsx("button", { type: "button", role: "menuitem", className: `bc-split-popover-btn bc-split-popover-${d.cell} ${active === d.mode ? 'bc-split-btn-active' : ''}`, title: d.title, "aria-label": d.title, onClick: () => { setOpen(false); onSplit(d.mode); }, children: d.glyph }, d.mode))), _jsx("span", { className: "bc-split-popover-center", "aria-hidden": "true", children: "\u25A6" })] }) }))] }));
}
//# sourceMappingURL=SplitButtons.js.map