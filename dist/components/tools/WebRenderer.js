import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { registerToolRenderer } from './registry';
function WebRenderer({ tool, running }) {
    const input = tool.input ?? {};
    const query = (input.query ?? input.search ?? '');
    const url = (input.url ?? '');
    const isSearch = tool.tool === 'WebSearch' || tool.tool === 'web_search';
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsxs("span", { className: "bc-tool-name", children: ["\uD83C\uDF10 ", isSearch ? 'web search' : 'web fetch'] }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), query && _jsxs("div", { className: "bc-tool-detail", children: ["\"", query, "\""] }), url && _jsx("div", { className: "bc-tool-detail", style: { opacity: 0.8 }, children: url }), tool.output && (_jsxs("div", { className: "bc-tool-output", children: [_jsx("span", { className: "bc-tool-output-label", children: "\u2192" }), _jsx("span", { className: "bc-tool-output-text", children: tool.output.length > 400 ? tool.output.slice(0, 400) + '…' : tool.output })] }))] }));
}
registerToolRenderer('WebSearch', WebRenderer);
registerToolRenderer('WebFetch', WebRenderer);
registerToolRenderer('web_search', WebRenderer);
registerToolRenderer('web_fetch', WebRenderer);
export default WebRenderer;
//# sourceMappingURL=WebRenderer.js.map