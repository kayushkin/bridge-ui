import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// model_generating renders three staggered dots (typing-indicator
// wave). Every other state renders the dot itself, with state-specific
// glyphs and animations attached via CSS. Keeps presentation in styles.css
// so adding a new state means a CSS rule, not a React change.
export function StatusDot({ state, title, className }) {
    return (_jsx("span", { className: `bc-status-dot bc-status-dot-${state}${className ? ` ${className}` : ''}`, title: title, "aria-label": title, children: state === 'model_generating' ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "bc-status-dot-blip" }), _jsx("span", { className: "bc-status-dot-blip" }), _jsx("span", { className: "bc-status-dot-blip" })] })) : null }));
}
//# sourceMappingURL=StatusDot.js.map