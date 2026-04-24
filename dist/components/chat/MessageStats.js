import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { flattenToRows } from './utils';
export function MessageStats({ meta }) {
    const [open, setOpen] = useState(false);
    const rows = flattenToRows(meta);
    return (_jsxs("div", { className: "bc-stats-wrapper", children: [_jsxs("button", { className: "bc-stats-toggle", onClick: () => setOpen(v => !v), children: [open ? '\u25BE' : '\u25B8', " Stats (", rows.length, ")"] }), open && (_jsx("div", { className: "bc-stats-dropdown", children: rows.map(([label, val], i) => (_jsxs("div", { className: "bc-stats-row", children: [_jsx("span", { className: "bc-stats-label", children: label }), _jsx("span", { className: "bc-stats-value", children: val })] }, `${label}-${i}`))) }))] }));
}
//# sourceMappingURL=MessageStats.js.map