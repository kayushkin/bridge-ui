import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function formatDetail(input) {
    if (!input)
        return '';
    const keys = Object.keys(input).slice(0, 2);
    return keys.map(k => `${k}=${JSON.stringify(input[k]).slice(0, 30)}`).join(', ');
}
export default function DefaultRenderer({ tool, running }) {
    const detail = formatDetail(tool.input);
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsx("span", { className: "bc-tool-name", children: tool.tool }), detail && _jsx("span", { className: "bc-tool-detail", children: detail }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), tool.output && (_jsxs("div", { className: "bc-tool-output", children: [_jsx("span", { className: "bc-tool-output-label", children: "\u2192" }), _jsx("span", { className: "bc-tool-output-text", children: tool.output })] }))] }));
}
//# sourceMappingURL=DefaultRenderer.js.map