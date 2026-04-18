import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { registerToolRenderer } from './registry';
function BashRenderer({ tool, running }) {
    const input = tool.input ?? {};
    const command = (input.command ?? input.cmd ?? '');
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsx("span", { className: "bc-tool-name", children: "\u2328 bash" }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), command && _jsxs("pre", { className: "bc-tool-output-code", children: ["$ ", command] }), tool.output && (_jsx("pre", { className: "bc-tool-output-code", style: { opacity: 0.8 }, children: tool.output.length > 800 ? tool.output.slice(0, 800) + '…' : tool.output }))] }));
}
registerToolRenderer('Bash', BashRenderer);
registerToolRenderer('bash', BashRenderer);
export default BashRenderer;
//# sourceMappingURL=BashRenderer.js.map