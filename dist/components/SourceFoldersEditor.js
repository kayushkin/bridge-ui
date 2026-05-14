import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../context';
import { useBridgeFolders } from '../useBridgeFolders';
// Editor for the runtime purpose→folder map. Each row maps a session.purpose
// tag to a folder. Rows with default=true come from LLMBRIDGE_SOURCE_FOLDERS;
// default=false rows are runtime overrides stored in source_folders. PUT
// replaces; DELETE reverts to the env default. The env var and table keep
// the legacy "source" naming for storage internals; the user-facing axis is
// "purpose".
//
// On Save, the editor offers to rebucket existing sessions whose folder was
// empty or matched the prior effective folder for that purpose. Manual moves
// (folder differs from the prior effective) are preserved.
export function SourceFoldersEditor() {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const folders = useBridgeFolders();
    const [rows, setRows] = useState([]);
    const [draft, setDraft] = useState({});
    const [applyToExisting, setApplyToExisting] = useState(true);
    const [busy, setBusy] = useState(null);
    const [status, setStatus] = useState(null);
    const [newPurpose, setNewPurpose] = useState('');
    const [newFolder, setNewFolder] = useState('');
    const refresh = useCallback(async () => {
        const res = await apiFetch(`${basePath}/source-folders`);
        if (!res.ok)
            return;
        const data = await res.json();
        setRows(data);
        setDraft(Object.fromEntries(data.map(r => [r.purpose, r.folder_name])));
    }, [apiFetch, basePath]);
    useEffect(() => { refresh(); }, [refresh]);
    const save = useCallback(async (purpose) => {
        const folder = draft[purpose]?.trim();
        if (!folder)
            return;
        setBusy(purpose);
        setStatus(null);
        const res = await apiFetch(`${basePath}/source-folders/${encodeURIComponent(purpose)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_name: folder, apply_to_existing: applyToExisting }),
        });
        setBusy(null);
        if (!res.ok) {
            setStatus(`save failed: ${await res.text()}`);
            return;
        }
        const result = await res.json();
        setStatus(applyToExisting
            ? `${purpose} → ${folder} (${result.updated} session${result.updated === 1 ? '' : 's'} rebucketed)`
            : `${purpose} → ${folder}`);
        await refresh();
    }, [apiFetch, basePath, draft, applyToExisting, refresh]);
    const revert = useCallback(async (purpose) => {
        setBusy(purpose);
        setStatus(null);
        const res = await apiFetch(`${basePath}/source-folders/${encodeURIComponent(purpose)}`, { method: 'DELETE' });
        setBusy(null);
        if (!res.ok) {
            setStatus(`revert failed: ${await res.text()}`);
            return;
        }
        setStatus(`${purpose}: reverted to env default`);
        await refresh();
    }, [apiFetch, basePath, refresh]);
    const addNew = useCallback(async () => {
        const purpose = newPurpose.trim();
        const fld = newFolder.trim();
        if (!purpose || !fld)
            return;
        setBusy(purpose);
        setStatus(null);
        const res = await apiFetch(`${basePath}/source-folders/${encodeURIComponent(purpose)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_name: fld, apply_to_existing: applyToExisting }),
        });
        setBusy(null);
        if (!res.ok) {
            setStatus(`add failed: ${await res.text()}`);
            return;
        }
        const result = await res.json();
        setStatus(applyToExisting
            ? `+ ${purpose} → ${fld} (${result.updated} rebucketed)`
            : `+ ${purpose} → ${fld}`);
        setNewPurpose('');
        setNewFolder('');
        await refresh();
    }, [apiFetch, basePath, newPurpose, newFolder, applyToExisting, refresh]);
    return (_jsxs("div", { className: "bset-container", children: [_jsx("h2", { className: "bset-title", children: "Session Purpose Folders" }), _jsxs("p", { className: "bset-subtitle", children: ["Auto-file new sessions into a sidebar folder based on their ", _jsx("code", { children: "purpose" }), " tag (set by the caller when creating the session). Rows marked ", _jsx("em", { children: "default" }), "come from LLMBRIDGE_SOURCE_FOLDERS; saving over them creates a runtime override."] }), _jsxs("label", { className: "bset-field", style: { marginBottom: '0.5rem' }, children: [_jsx("input", { type: "checkbox", checked: applyToExisting, onChange: e => setApplyToExisting(e.target.checked) }), ' ', "Apply to existing sessions (preserves manual moves)"] }), _jsxs("table", { className: "bset-sf-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Purpose" }), _jsx("th", { children: "Folder" }), _jsx("th", { children: "Origin" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [rows.map(r => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { children: r.purpose }) }), _jsx("td", { children: _jsxs("select", { value: draft[r.purpose] ?? r.folder_name, onChange: e => setDraft(prev => ({ ...prev, [r.purpose]: e.target.value })), disabled: busy === r.purpose, children: [folders.folderOrder.map(f => _jsx("option", { value: f, children: f }, f)), !folders.folderOrder.includes(r.folder_name) && (_jsxs("option", { value: r.folder_name, children: [r.folder_name, " (missing)"] }))] }) }), _jsx("td", { children: r.default ? _jsx("em", { children: "default" }) : 'override' }), _jsxs("td", { children: [_jsx("button", { className: "bset-save-btn", onClick: () => save(r.purpose), disabled: busy === r.purpose || (draft[r.purpose] ?? r.folder_name) === r.folder_name, children: "Save" }), !r.default && (_jsx("button", { className: "bset-save-btn", onClick: () => revert(r.purpose), disabled: busy === r.purpose, style: { marginLeft: '0.5rem' }, children: "Revert" }))] })] }, r.purpose))), _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { placeholder: "new purpose tag", value: newPurpose, onChange: e => setNewPurpose(e.target.value) }) }), _jsx("td", { children: _jsxs("select", { value: newFolder, onChange: e => setNewFolder(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 pick folder \u2014" }), folders.folderOrder.map(f => _jsx("option", { value: f, children: f }, f))] }) }), _jsx("td", {}), _jsx("td", { children: _jsx("button", { className: "bset-save-btn", onClick: addNew, disabled: !newPurpose.trim() || !newFolder || busy !== null, children: "Add" }) })] })] })] }), status && _jsx("p", { className: "bset-subtitle", children: status })] }));
}
//# sourceMappingURL=SourceFoldersEditor.js.map