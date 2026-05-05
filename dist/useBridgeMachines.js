import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeConfig } from './context';
// useBridgeMachines manages the host registry that instances bind to.
// Mirrors useBridgeInstances' poll-and-snapshot pattern so the two hooks
// can be combined without a second source of truth.
export function useBridgeMachines() {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const lastJsonRef = useRef('');
    const fetchMachines = useCallback(async () => {
        try {
            const res = await fetchFn(`${basePath}/machines`);
            if (res.ok) {
                const data = (await res.json()) ?? [];
                const json = JSON.stringify(data);
                if (json !== lastJsonRef.current) {
                    lastJsonRef.current = json;
                    setMachines(data);
                }
                setError(null);
            }
            else {
                setError(`HTTP ${res.status}`);
            }
        }
        catch (err) {
            setError(`${err}`);
        }
        finally {
            setLoading(false);
        }
    }, [fetchFn, basePath]);
    useEffect(() => {
        fetchMachines();
        const interval = setInterval(fetchMachines, 30000);
        return () => clearInterval(interval);
    }, [fetchMachines]);
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