import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { structuredPatch } from 'diff';
// DiffView renders a single file's before/after as a unified-diff hunk list.
// Empty when the two sides match. Used by both EditRenderer (single file per
// tool call) and BashRenderer (one DiffView per file the bash command touched).
export function DiffView({ filePath, before, after }) {
    if (before === after) {
        return _jsx("div", { className: "bc-tool-output-code", style: { opacity: 0.6 }, children: "No changes" });
    }
    const patch = structuredPatch(filePath || 'file', filePath || 'file', before, after, '', '', { context: 3 });
    if (patch.hunks.length === 0) {
        return _jsx("div", { className: "bc-tool-output-code", style: { opacity: 0.6 }, children: "No changes" });
    }
    return (_jsx("pre", { className: "bc-diff", children: patch.hunks.map((h, i) => _jsx(HunkView, { hunk: h }, i)) }));
}
function HunkView({ hunk }) {
    return (_jsxs("div", { className: "bc-diff-hunk", children: [_jsxs("div", { className: "bc-diff-hunk-header", children: ["@@ -", hunk.oldStart, ",", hunk.oldLines, " +", hunk.newStart, ",", hunk.newLines, " @@"] }), hunk.lines.map((line, i) => {
                const cls = line.startsWith('+')
                    ? 'bc-diff-add'
                    : line.startsWith('-')
                        ? 'bc-diff-del'
                        : 'bc-diff-ctx';
                return _jsx("div", { className: cls, children: line }, i);
            })] }));
}
//# sourceMappingURL=DiffView.js.map