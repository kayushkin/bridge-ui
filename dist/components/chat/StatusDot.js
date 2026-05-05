import { jsx as _jsx } from "react/jsx-runtime";
export function StatusDot({ state, title, className }) {
    return (_jsx("span", { className: `bc-status-dot bc-status-dot-${state}${className ? ` ${className}` : ''}`, title: title, "aria-label": title }));
}
//# sourceMappingURL=StatusDot.js.map