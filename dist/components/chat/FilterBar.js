import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function FilterBar({ types, hidden, onToggle }) {
    if (types.length === 0)
        return null;
    return (_jsxs("div", { className: "bc-filter-bar", children: [_jsx("span", { className: "bc-filter-label", children: "show:" }), types.map(t => {
                const on = !hidden.has(t);
                return (_jsx("button", { type: "button", className: `bc-filter-chip${on ? ' bc-filter-chip-on' : ''}`, onClick: () => onToggle(t), children: t }, t));
            })] }));
}
//# sourceMappingURL=FilterBar.js.map