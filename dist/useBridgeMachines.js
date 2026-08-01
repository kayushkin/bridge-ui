import { useCallback, useMemo } from 'react';
import { useBridgeConfig } from './context';
import { SharedPoll, loadJSONList, sharedPoll, useSharedPoll } from './sharedPoll';
/** The one `/machines` poll for this (fetch, basePath) — same store the
 *  instances hook uses, keyed on a different URL. */
function machinesPoll(fetchFn, basePath) {
    return sharedPoll(fetchFn, `machines ${basePath}`, () => new SharedPoll(() => loadJSONList(fetchFn, `${basePath}/machines`), []));
}
// useBridgeMachines manages the host registry that instances bind to.
// Mirrors useBridgeInstances' poll-and-snapshot pattern so the two hooks
// can be combined without a second source of truth.
export function useBridgeMachines() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const poll = useMemo(() => machinesPoll(fetchFn, basePath), [fetchFn, basePath]);
    const { data: machines, loading, error } = useSharedPoll(poll);
    const fetchMachines = poll.refresh;
    const createMachine = useCallback(async (data) => {
        try {
            const res = await fetchFn(`${basePath}/machines`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok)
                return null;
            const m = await res.json();
            await fetchMachines();
            return m;
        }
        catch {
            return null;
        }
    }, [fetchFn, basePath, fetchMachines]);
    const updateMachine = useCallback(async (id, data) => {
        try {
            const res = await fetchFn(`${basePath}/machines/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (res.ok) {
                await fetchMachines();
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }, [fetchFn, basePath, fetchMachines]);
    const deleteMachine = useCallback(async (id) => {
        try {
            const res = await fetchFn(`${basePath}/machines/${id}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                await fetchMachines();
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }, [fetchFn, basePath, fetchMachines]);
    const machineMap = useMemo(() => {
        const m = new Map();
        for (const x of machines)
            m.set(x.id, x);
        return m;
    }, [machines]);
    return useMemo(() => ({
        machines,
        machineMap,
        loading,
        error,
        createMachine,
        updateMachine,
        deleteMachine,
        refresh: fetchMachines,
    }), [machines, machineMap, loading, error, createMachine, updateMachine, deleteMachine, fetchMachines]);
}
//# sourceMappingURL=useBridgeMachines.js.map