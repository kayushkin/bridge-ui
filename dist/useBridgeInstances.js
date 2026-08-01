import { useCallback, useMemo } from 'react';
import { useBridgeConfig } from './context';
import { SharedPoll, loadJSONList, sharedPoll, useSharedPoll } from './sharedPoll';
/** The one `/instances` poll for this (fetch, basePath). Every component that
 *  calls the hook reads this store, so the page runs one timer no matter how
 *  many of them there are. */
function instancesPoll(fetchFn, basePath) {
    return sharedPoll(fetchFn, `instances ${basePath}`, () => new SharedPoll(() => loadJSONList(fetchFn, `${basePath}/instances`), []));
}
export function useBridgeInstances() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const poll = useMemo(() => instancesPoll(fetchFn, basePath), [fetchFn, basePath]);
    const { data: instances, loading, error } = useSharedPoll(poll);
    const fetchInstances = poll.refresh;
    const instancesByHarness = useCallback((harness) => {
        return instances.filter(i => i.harness_type === harness && i.enabled);
    }, [instances]);
    const createInstance = useCallback(async (data) => {
        try {
            const res = await fetchFn(`${basePath}/instances`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok)
                return null;
            const inst = await res.json();
            await fetchInstances();
            return inst;
        }
        catch {
            return null;
        }
    }, [fetchFn, basePath, fetchInstances]);
    const updateInstance = useCallback(async (id, data) => {
        try {
            const res = await fetchFn(`${basePath}/instances/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (res.ok) {
                await fetchInstances();
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }, [fetchFn, basePath, fetchInstances]);
    const deleteInstance = useCallback(async (id) => {
        try {
            const res = await fetchFn(`${basePath}/instances/${id}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                await fetchInstances();
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }, [fetchFn, basePath, fetchInstances]);
    const getStatus = useCallback(async (id) => {
        try {
            const res = await fetchFn(`${basePath}/instances/${id}/status`);
            if (!res.ok)
                return null;
            return await res.json();
        }
        catch {
            return null;
        }
    }, [fetchFn, basePath]);
    const getCredentials = useCallback(async (id) => {
        try {
            const res = await fetchFn(`${basePath}/instances/${id}/credentials`);
            if (!res.ok)
                return [];
            return await res.json() ?? [];
        }
        catch {
            return [];
        }
    }, [fetchFn, basePath]);
    const bindCredential = useCallback(async (instanceId, credentialId, priority, maxConcurrent) => {
        try {
            const res = await fetchFn(`${basePath}/instances/${instanceId}/credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential_id: credentialId, priority, max_concurrent: maxConcurrent }),
            });
            return res.ok || res.status === 201;
        }
        catch {
            return false;
        }
    }, [fetchFn, basePath]);
    const unbindCredential = useCallback(async (instanceId, credentialId) => {
        try {
            const res = await fetchFn(`${basePath}/instances/${instanceId}/credentials/${credentialId}`, {
                method: 'DELETE',
            });
            return res.ok || res.status === 204;
        }
        catch {
            return false;
        }
    }, [fetchFn, basePath]);
    const instanceMap = useMemo(() => {
        const map = new Map();
        for (const inst of instances)
            map.set(inst.id, inst);
        return map;
    }, [instances]);
    return useMemo(() => ({
        instances,
        loading,
        error,
        instancesByHarness,
        instanceMap,
        createInstance,
        updateInstance,
        deleteInstance,
        getStatus,
        getCredentials,
        bindCredential,
        unbindCredential,
        refresh: fetchInstances,
    }), [
        instances,
        loading,
        error,
        instancesByHarness,
        instanceMap,
        createInstance,
        updateInstance,
        deleteInstance,
        getStatus,
        getCredentials,
        bindCredential,
        unbindCredential,
        fetchInstances,
    ]);
}
//# sourceMappingURL=useBridgeInstances.js.map