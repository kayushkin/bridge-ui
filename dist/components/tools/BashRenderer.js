import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { registerToolRenderer } from './registry';
import { useToolContext } from './context';
import { useBridgeConfig } from '../../context';
import { DiffView } from './DiffView';
import { loadSide, sidesHint, } from './snapshots';
// BashRenderer shows the command, its output, and — for any files the
// command created/modified/deleted — a per-file diff fetched from the
// bridge server's snapshot store. The set of tracked files is determined
// server-side from the bash AST (see bashfiles.go); this component just
// renders whatever comes back, so a command that touches no recognized
// files (cat, ls, grep, …) shows up identical to the old renderer.
function BashRenderer({ tool, running }) {
    const { sessionId } = useToolContext();
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const input = tool.input ?? {};
    const command = (input.command ?? input.cmd ?? '');
    const [diffs, setDiffs] = useState(null);
    const [state, setState] = useState('idle');
    const [errorHint, setErrorHint] = useState('');
    const needsFetch = !running && tool.tool_id !== '' && !!sessionId;
    useEffect(() => {
        if (!needsFetch)
            return;
        let cancelled = false;
        setState('loading');
        (async () => {
            try {
                const res = await fetchFn(`${basePath}/sessions/${sessionId}/tools/${tool.tool_id}/snapshots`);
                if (!res.ok)
                    throw new Error(`snapshots ${res.status}`);
                const meta = (await res.json());
                const loaded = [];
                for (const entry of meta.files) {
                    const before = await loadSide(fetchFn, basePath, 'Before', entry.before, undefined);
                    const after = await loadSide(fetchFn, basePath, 'After', entry.after, undefined);
                    loaded.push({
                        filePath: entry.file_path,
                        before,
                        after,
                        hint: sidesHint(entry.before, entry.after),
                    });
                }
                if (cancelled)
                    return;
                setDiffs(loaded);
                setState('ready');
            }
            catch (err) {
                if (cancelled)
                    return;
                setState('error');
                setErrorHint(String(err));
            }
        })();
        return () => { cancelled = true; };
    }, [needsFetch, sessionId, tool.tool_id, fetchFn, basePath]);
    return (_jsxs("div", { className: `bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`, children: [_jsxs("div", { className: "bc-tool-header", children: [_jsx("span", { className: "bc-tool-name", children: "\u2328 bash" }), running && _jsx("span", { className: "bc-tool-spinner", children: "\u27F3" }), tool.error && !running && _jsx("span", { className: "bc-tool-error-badge", children: "error" })] }), command && _jsxs("pre", { className: "bc-tool-output-code", children: ["$ ", command] }), tool.output && (_jsx("pre", { className: "bc-tool-output-code", style: { opacity: 0.8 }, children: tool.output.length > 800 ? tool.output.slice(0, 800) + '…' : tool.output })), state === 'error' && (_jsxs("div", { className: "bc-tool-output-code", style: { opacity: 0.7 }, children: ["Snapshot unavailable: ", errorHint] })), state === 'ready' && diffs && diffs.length > 0 && (_jsx("div", { className: "bc-bash-diffs", children: diffs.map((d) => (_jsx(BashFileDiff, { diff: d }, d.filePath))) }))] }));
}
function BashFileDiff({ diff }) {
    const filename = diff.filePath.split('/').pop() ?? diff.filePath;
    return (_jsxs("div", { className: "bc-bash-file-diff", children: [_jsxs("div", { className: "bc-tool-detail", title: diff.filePath, children: [_jsx("strong", { children: filename }), filename !== diff.filePath && (_jsx("span", { style: { opacity: 0.6, marginLeft: 4 }, children: diff.filePath }))] }), _jsx(DiffView, { filePath: diff.filePath, before: diff.before.content, after: diff.after.content }), diff.hint && (_jsx("div", { className: "bc-tool-output-code", style: { opacity: 0.6 }, children: diff.hint }))] }));
}
registerToolRenderer('Bash', BashRenderer);
registerToolRenderer('bash', BashRenderer);
export default BashRenderer;
//# sourceMappingURL=BashRenderer.js.map