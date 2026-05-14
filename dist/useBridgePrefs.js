import { useState, useEffect, useCallback, useMemo } from 'react';
export function useBridgePrefs(options = {}) {
    const { fetch: fetchFn, endpoint, storagePrefix = 'bridge-prefs' } = options;
    const [prefs, setPrefs] = useState({});
    const serverMode = !!(fetchFn && endpoint);
    // Load prefs on mount
    useEffect(() => {
        ;
        (async () => {
            if (serverMode) {
                try {
                    const res = await fetchFn(endpoint);
                    if (!res.ok)
                        return;
                    const data = await res.json();
                    setPrefs(data);
                }
                catch { /* ignore */ }
            }
            else {
                // localStorage-only mode
                try {
                    const stored = localStorage.getItem(storagePrefix);
                    if (stored)
                        setPrefs(JSON.parse(stored));
                }
                catch { /* ignore */ }
            }
        })();
    }, [fetchFn, endpoint, serverMode, storagePrefix]);
    const updatePrefs = useCallback(async (partial) => {
        setPrefs(prev => {
            const next = { ...prev };
            if (partial.last_harness)
                next.last_harness = partial.last_harness;
            if (partial.last_instance_id)
                next.last_instance_id = partial.last_instance_id;
            if (partial.last_session) {
                next.last_session = { ...next.last_session, ...partial.last_session };
            }
            if (partial.last_instance) {
                next.last_instance = { ...next.last_instance, ...partial.last_instance };
            }
            if (partial.defaults) {
                next.defaults = { ...next.defaults, ...partial.defaults };
            }
            // Persist to localStorage in both modes
            try {
                localStorage.setItem(storagePrefix, JSON.stringify(next));
            }
            catch { /* ignore */ }
            return next;
        });
        if (serverMode) {
            await fetchFn(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(partial),
            });
        }
    }, [fetchFn, endpoint, serverMode, storagePrefix]);
    const setLastHarness = useCallback((harness) => {
        updatePrefs({ last_harness: harness });
    }, [updatePrefs]);
    const setLastInstanceId = useCallback((instanceId) => {
        updatePrefs({ last_instance_id: instanceId });
    }, [updatePrefs]);
    const setLastSession = useCallback((harness, sessionId) => {
        updatePrefs({ last_session: { [harness]: sessionId } });
    }, [updatePrefs]);
    const setHarnessDefaults = useCallback((harness, defaults) => {
        updatePrefs({ defaults: { [harness]: defaults } });
    }, [updatePrefs]);
    const getDefaults = useCallback((harness) => {
        return prefs.defaults?.[harness] ?? {};
    }, [prefs.defaults]);
    const setLastInstance = useCallback((harness, instanceId) => {
        updatePrefs({ last_instance: { [harness]: instanceId } });
    }, [updatePrefs]);
    const getLastInstance = useCallback((harness) => {
        return prefs.last_instance?.[harness] ?? null;
    }, [prefs.last_instance]);
    const getLastSession = useCallback((harness) => {
        return prefs.last_session?.[harness] ?? null;
    }, [prefs.last_session]);
    return useMemo(() => ({
        prefs,
        setLastHarness,
        setLastInstanceId,
        setLastSession,
        setLastInstance,
        setHarnessDefaults,
        getDefaults,
        getLastInstance,
        getLastSession,
    }), [
        prefs,
        setLastHarness,
        setLastInstanceId,
        setLastSession,
        setLastInstance,
        setHarnessDefaults,
        getDefaults,
        getLastInstance,
        getLastSession,
    ]);
}
//# sourceMappingURL=useBridgePrefs.js.map