import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { registerToolRenderer } from './registry';
import { useToolContext } from './context';
import { useBridgeConfig } from '../../context';
import { DiffView } from './DiffView';
import { loadSide, sidesHint, } from './snapshots';
// EditRenderer handles `Edit`, `Write`, and `MultiEdit` tool calls — every
// tool whose tool_input names a single `file_path`. (Bash multi-file diffs
// are handled by BashRenderer.) There are two paths:
//   1. Fast path: the tool input carries the full diff payload already
//      (old_string / new_string for Edit; content for Write when the before
//      was missing). No fetch required.
//   2. Fetch path: ask the bridge server for before/after snapshots keyed by
//      tool_use_id and render the diff from the blob contents.
function EditRenderer({ tool, running }) {
    const { sessionId } = useToolContext();
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const input = (tool.input ?? {});
    // NotebookEdit uses `notebook_path`; everything else uses `file_path`.
    const filePath = (input.file_path ?? input.notebook_path ?? input.path ?? '');
    const isEdit = tool.tool === 'Edit';
    const isWrite = tool.tool === 'Write';
    const fastBefore = isEdit ? input.old_string : undefined;
    const fastAfter = isEdit
        ? input.new_string
        : isWrite
            ? input.content
            : undefined;
    const haveFastPath = typeof fastBefore === 'string' && typeof fastAfter === 'string';
    // For Write, before-state only exists in snapshots — the tool input has
    // no old content field. Same for MultiEdit which doesn't expose its diff.
    const needsFetch = !running && tool.tool_id !== '' && (!haveFastPath || isWrite);
    const [sides, setSides] = useState(null);
    const [state, setState] = useState('idle');
    const [hint, setHint] = useState('');
    useEffect(() => {
        if (!needsFetch || !sessionId)
            return;
        let cancelled = false;
        setState('loading');
        (async () => {
            try {
                const res = await fetchFn(`${basePath}/sessions/${sessionId}/tools/${tool.tool_id}/snapshots`);
                if (!res.ok)
                    throw new Error(`snapshots ${res.status}`);
                const meta = (await res.json());
                // Edit/Write/MultiEdit only ever snapshot one file; pick the entry
                // matching tool_input.file_path, or the first one if there's only
                // one. Server is authoritative — never trust filePath when the
                // server reports something different.
                const entry = meta.files.find((f) => f.file_path === filePath) ?? meta.files[0] ?? null;
                const before = entry?.before ?? null;
                const after = entry?.after ?? null;
                const beforeSide = await loadSide(fetchFn, basePath, 'Before', before, fastBefore);
                const afterSide = await loadSide(fetchFn, basePath, 'After', after, fastAfter);
                if (cancelled)
                    return;
                setSides({ before: beforeSide, after: afterSide });
                setHint(sidesHint(before, after));
                setState('ready');
            }
            catch (err) {
                if (cancelled)
                    return;
                setState('error');
                setHint(String(err));
            }
        })();
        return () => { cancelled = true; };
    }, [needsFetch, sessionId, tool.tool_id, fetchFn, basePath, fastBefore, fastAfter, filePath]);
    const label = tool.tool;
    const filename = filePath ? filePath.split('/').pop() : '';
    // Pick whichever content we have. Fast path wins when fetch wasn't needed
    // (or hasn't landed yet) because it's instant and still accurate.
    const before = sides?.before.content ?? fastBefore ?? '';
    const after = sides?.after.content ?? fastAfter ?? '';
    const showDiff = (haveFastPath && !isWrite) || state === 'ready';
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsxs("span", { className: "bc-tool-name", children: ["\uD83D\uDCDD ", label] }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), filePath && (_jsxs("div", { className: "bc-tool-detail", title: filePath, children: [filename && _jsx("strong", { children: filename }), filename !== filePath && _jsx("span", { style: { opacity: 0.6, marginLeft: 4 }, children: filePath })] })), running && _jsx("div", { className: "bc-tool-output-code", style: { opacity: 0.6 }, children: "Applying\u2026" }), !running && state === 'loading' && !haveFastPath && (_jsx("div", { className: "bc-tool-output-code", style: { opacity: 0.6 }, children: "Loading snapshot\u2026" })), !running && state === 'error' && (_jsxs("div", { className: "bc-tool-output-code", style: { opacity: 0.7 }, children: ["Snapshot unavailable: ", hint] })), !running && showDiff && (_jsx(DiffView, { filePath: filePath, before: before, after: after })), hint && state === 'ready' && (_jsx("div", { className: "bc-tool-output-code", style: { opacity: 0.6 }, children: hint })), tool.output && (_jsxs("div", { className: "bc-tool-output", children: [_jsx("span", { className: "bc-tool-output-label", children: "\u2192" }), _jsx("span", { className: "bc-tool-output-text", children: tool.output })] }))] }));
}
registerToolRenderer('Edit', EditRenderer);
registerToolRenderer('Write', EditRenderer);
registerToolRenderer('MultiEdit', EditRenderer);
registerToolRenderer('NotebookEdit', EditRenderer);
export default EditRenderer;
//# sourceMappingURL=EditRenderer.js.map