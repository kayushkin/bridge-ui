import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from './context';
export function useBridgeFolders() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [folderOrder, setFolderOrder] = useState([]);
    const refresh = useCallback(async () => {
        const res = await fetchFn(`${basePath}/folders`);
        if (!res.ok)
            return;
        const data = await res.json();
        setFolderOrder(data.folder_order ?? []);
    }, [fetchFn, basePath]);
    useEffect(() => { refresh(); }, [refresh]);
    const createFolder = useCallback(async (name) => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        setFolderOrder(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
        await fetchFn(`${basePath}/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmed }),
        });
    }, [fetchFn, basePath]);
    const deleteFolder = useCallback(async (name) => {
        setFolderOrder(prev => prev.filter(f => f !== name));
        await fetchFn(`${basePath}/folders/${encodeURIComponent(name)}`, { method: 'DELETE' });
    }, [fetchFn, basePath]);
    const renameFolder = useCallback(async (oldName, newName) => {
        const trimmed = newName.trim();
        if (!trimmed || oldName === trimmed)
            return;
        setFolderOrder(prev => {
            if (prev.includes(trimmed))
                return prev.filter(f => f !== oldName);
            return prev.map(f => f === oldName ? trimmed : f);
        });
        await fetchFn(`${basePath}/folders/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: trimmed }),
        });
    }, [fetchFn, basePath]);
    const setSessionFolder = useCallback(async (sessionId, folder) => {
        if (folder && !folderOrder.includes(folder)) {
            setFolderOrder(prev => prev.includes(folder) ? prev : [...prev, folder]);
        }
        await fetchFn(`${basePath}/sessions/${sessionId}/folder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder }),
        });
    }, [fetchFn, basePath, folderOrder]);
    return useMemo(() => ({
        folderOrder,
        refresh,
        createFolder,
        deleteFolder,
        renameFolder,
        setSessionFolder,
    }), [folderOrder, refresh, createFolder, deleteFolder, renameFolder, setSessionFolder]);
}
//# sourceMappingURL=useBridgeFolders.js.map