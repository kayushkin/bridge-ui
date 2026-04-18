import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { registerToolRenderer } from './registry';
function GrepRenderer({ tool, running }) {
    const input = tool.input ?? {};
    const pattern = (input.pattern ?? input.query ?? '');
    const path = (input.path ?? input.dir ?? '');
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsxs("span", { className: "bc-tool-name", children: ["\uD83D\uDD0D ", tool.tool.toLowerCase()] }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), pattern && (_jsxs("div", { className: "bc-tool-detail", children: [_jsx("code", { children: pattern }), path && _jsxs("span", { style: { opacity: 0.6, marginLeft: 6 }, children: ["in ", path] })] })), tool.output && (_jsx("pre", { className: "bc-tool-output-code", style: { opacity: 0.8 }, children: tool.output.length > 600 ? tool.output.slice(0, 600) + '…' : tool.output }))] }));
}
registerToolRenderer('Grep', GrepRenderer);
registerToolRenderer('Glob', GrepRenderer);
registerToolRenderer('grep', GrepRenderer);
registerToolRenderer('glob', GrepRenderer);
export default GrepRenderer;
//# sourceMappingURL=GrepRenderer.js.map