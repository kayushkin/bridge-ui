import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useMinimalChrome } from './MinimalChromeContext';
export function SessionDrawer({ children }) {
    const { drawerOpen, setDrawerOpen } = useMinimalChrome();
    useEffect(() => {
        if (!drawerOpen)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                setDrawerOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [drawerOpen, setDrawerOpen]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `bc-mc-scrim ${drawerOpen ? 'bc-mc-scrim-open' : ''}`, onClick: () => setDrawerOpen(false), "aria-hidden": !drawerOpen }), _jsxs("aside", { className: `bc-mc-drawer ${drawerOpen ? 'bc-mc-drawer-open' : ''}`, "aria-hidden": !drawerOpen, role: "dialog", "aria-label": "Sessions", children: [_jsxs("div", { className: "bc-mc-drawer-header", children: [_jsx("span", { className: "bc-mc-drawer-title", children: "Sessions" }), _jsx("button", { type: "button", className: "bc-mc-close", onClick: () => setDrawerOpen(false), "aria-label": "Close", children: "\u00D7" })] }), _jsx("div", { className: "bc-mc-drawer-body", children: children })] })] }));
}
//# sourceMappingURL=SessionDrawer.js.map