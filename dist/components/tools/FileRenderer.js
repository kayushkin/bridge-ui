import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { registerToolRenderer } from './registry';
function FileRenderer({ tool, running }) {
    const input = tool.input ?? {};
    const path = (input.path ?? input.file_path ?? input.file ?? '');
    const content = (input.content ?? input.new_string ?? input.new_text ?? '');
    const label = tool.tool.replace(/_/g, ' ');
    const filename = path ? path.split('/').pop() : '';
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsxs("span", { className: "bc-tool-name", children: ["\uD83D\uDCC4 ", label] }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), path && (_jsxs("div", { className: "bc-tool-detail", title: path, children: [filename && _jsx("strong", { children: filename }), filename !== path && _jsx("span", { style: { opacity: 0.6, marginLeft: 4 }, children: path })] })), content && !running && (_jsx("pre", { className: "bc-tool-output-code", children: content.length > 500 ? content.slice(0, 500) + '…' : content })), tool.output && (_jsxs("div", { className: "bc-tool-output", children: [_jsx("span", { className: "bc-tool-output-label", children: "\u2192" }), _jsx("span", { className: "bc-tool-output-text", children: tool.output })] }))] }));
}
registerToolRenderer('write_file', FileRenderer);
registerToolRenderer('edit_file', FileRenderer);
registerToolRenderer('read_file', FileRenderer);
registerToolRenderer('Write', FileRenderer);
registerToolRenderer('Edit', FileRenderer);
registerToolRenderer('Read', FileRenderer);
export default FileRenderer;
//# sourceMappingURL=FileRenderer.js.map