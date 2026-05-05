import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef } from 'react';
import { useMinimalChrome } from './MinimalChromeContext';
export function ChromeSheet() {
    const { sheetOpen, setSheetOpen, registerControlsSlot, setOverride } = useMinimalChrome();
    const slotRef = useRef(null);
    const setSlotNode = useCallback((el) => {
        slotRef.current = el;
        registerControlsSlot(el);
    }, [registerControlsSlot]);
    useEffect(() => {
        if (!sheetOpen)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                setSheetOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [sheetOpen, setSheetOpen]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `bc-mc-scrim ${sheetOpen ? 'bc-mc-scrim-open' : ''}`, onClick: () => setSheetOpen(false), "aria-hidden": !sheetOpen }), _jsxs("div", { className: `bc-mc-sheet ${sheetOpen ? 'bc-mc-sheet-open' : ''}`, role: "dialog", "aria-label": "Chat controls", "aria-hidden": !sheetOpen, children: [_jsx("div", { className: "bc-mc-sheet-grabber" }), _jsxs("div", { className: "bc-mc-sheet-header", children: [_jsx("span", { className: "bc-mc-sheet-title", children: "Controls" }), _jsx("button", { type: "button", className: "bc-mc-close", onClick: () => setSheetOpen(false), "aria-label": "Close", children: "\u00D7" })] }), _jsxs("div", { className: "bc-mc-sheet-body", children: [_jsx("div", { className: "bc-mc-controls-slot", ref: setSlotNode }), _jsx("div", { className: "bc-mc-sheet-footer", children: _jsx("button", { type: "button", className: "bc-mc-escape", onClick: () => { setOverride('full'); setSheetOpen(false); }, children: "Show full layout" }) })] })] })] }));
}
//# sourceMappingURL=ChromeSheet.js.map