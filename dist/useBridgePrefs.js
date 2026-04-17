import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
const LS_MIGRATED_SUFFIX = '-migrated';
export function useBridgePrefs(options = {}) {
    const { fetch: fetchFn, endpoint, storagePrefix = 'bridge-prefs' } = options;
    const [prefs, setPrefs] = useState({});
    const migratedRef = useRef(false);
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
                    // One-time migration from old localStorage keys
                    if (!migratedRef.current && !localStorage.getItem(storagePrefix + LS_MIGRATED_SUFFIX)) {
                        migratedRef.current = true;
                        const lsHarness = localStorage.getItem('dash-bridge-harness');
                        const lsSession = localStorage.getItem('dash-bridge-session');
                        if (lsHarness || lsSession) {
                            const migrationPrefs = {};
                            if (lsHarness)
                                migrationPrefs.last_harness = lsHarness;
                            if (lsHarness && lsSession) {
                                migrationPrefs.last_session = { [lsHarness]: lsSession };
                            }
                            const importRes = await fetchFn(endpoint, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(migrationPrefs),
                            });
                            if (importRes.ok) {
                                localStorage.removeItem('dash-bridge-harness');
                                localStorage.removeItem('dash-bridge-session');
                                localStorage.setItem(storagePrefix + LS_MIGRATED_SUFFIX, '1');
                                setPrefs(prev => ({ ...prev, ...migrationPrefs }));
                            }
                        }
                        else {
                            localStorage.setItem(storagePrefix + LS_MIGRATED_SUFFIX, '1');
                        }
                    }
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
            if (partial.session_names) {
                next.session_names = { ...next.session_names, ...partial.session_names };
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
    const setSessionName = useCallback((sessionId, name) => {
        updatePrefs({ session_names: { [sessionId]: name } });
    }, [updatePrefs]);
    const getSessionName = useCallback((sessionId) => {
        return prefs.session_names?.[sessionId] ?? null;
    }, [prefs.session_names]);
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
        setSessionName,
        getSessionName,
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
        setSessionName,
        getSessionName,
    ]);
}
//# sourceMappingURL=useBridgePrefs.js.map