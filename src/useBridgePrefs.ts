import { useState, useEffect, useCallback, useRef } from 'react'
import type { FetchFn, BridgePrefs, HarnessDefaults } from './types'

interface BridgePrefsOptions {
  /** If provided, prefs are synced to this server endpoint. Otherwise localStorage-only. */
  fetch?: FetchFn
  /** Server endpoint for prefs (e.g. "/api/session-meta/bridge"). Required if fetch is provided. */
  endpoint?: string
  /** localStorage key prefix (default: "bridge-prefs") */
  storagePrefix?: string
}

const LS_MIGRATED_SUFFIX = '-migrated'

export function useBridgePrefs(options: BridgePrefsOptions = {}) {
  const { fetch: fetchFn, endpoint, storagePrefix = 'bridge-prefs' } = options
  const [prefs, setPrefs] = useState<BridgePrefs>({})
  const migratedRef = useRef(false)
  const serverMode = !!(fetchFn && endpoint)

  // Load prefs on mount
  useEffect(() => {
    ;(async () => {
      if (serverMode) {
        try {
          const res = await fetchFn!(endpoint!)
          if (!res.ok) return
          const data: BridgePrefs = await res.json()
          setPrefs(data)

          // One-time migration from old localStorage keys
          if (!migratedRef.current && !localStorage.getItem(storagePrefix + LS_MIGRATED_SUFFIX)) {
            migratedRef.current = true
            const lsHarness = localStorage.getItem('dash-bridge-harness')
            const lsSession = localStorage.getItem('dash-bridge-session')

            if (lsHarness || lsSession) {
              const migrationPrefs: BridgePrefs = {}
              if (lsHarness) migrationPrefs.last_harness = lsHarness
              if (lsHarness && lsSession) {
                migrationPrefs.last_session = { [lsHarness]: lsSession }
              }
              const importRes = await fetchFn!(endpoint!, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(migrationPrefs),
              })
              if (importRes.ok) {
                localStorage.removeItem('dash-bridge-harness')
                localStorage.removeItem('dash-bridge-session')
                localStorage.setItem(storagePrefix + LS_MIGRATED_SUFFIX, '1')
                setPrefs(prev => ({ ...prev, ...migrationPrefs }))
              }
            } else {
              localStorage.setItem(storagePrefix + LS_MIGRATED_SUFFIX, '1')
            }
          }
        } catch { /* ignore */ }
      } else {
        // localStorage-only mode
        try {
          const stored = localStorage.getItem(storagePrefix)
          if (stored) setPrefs(JSON.parse(stored))
        } catch { /* ignore */ }
      }
    })()
  }, [fetchFn, endpoint, serverMode, storagePrefix])

  const updatePrefs = useCallback(async (partial: BridgePrefs) => {
    setPrefs(prev => {
      const next = { ...prev }
      if (partial.last_harness) next.last_harness = partial.last_harness
      if (partial.last_instance_id) next.last_instance_id = partial.last_instance_id
      if (partial.last_session) {
        next.last_session = { ...next.last_session, ...partial.last_session }
      }
      if (partial.last_instance) {
        next.last_instance = { ...next.last_instance, ...partial.last_instance }
      }
      if (partial.defaults) {
        next.defaults = { ...next.defaults, ...partial.defaults }
      }

      // Persist to localStorage in both modes
      try { localStorage.setItem(storagePrefix, JSON.stringify(next)) } catch { /* ignore */ }

      return next
    })

    if (serverMode) {
      await fetchFn!(endpoint!, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
    }
  }, [fetchFn, endpoint, serverMode, storagePrefix])

  const setLastHarness = useCallback((harness: string) => {
    updatePrefs({ last_harness: harness })
  }, [updatePrefs])

  const setLastInstanceId = useCallback((instanceId: string) => {
    updatePrefs({ last_instance_id: instanceId })
  }, [updatePrefs])

  const setLastSession = useCallback((harness: string, sessionId: string) => {
    updatePrefs({ last_session: { [harness]: sessionId } })
  }, [updatePrefs])

  const setHarnessDefaults = useCallback((harness: string, defaults: HarnessDefaults) => {
    updatePrefs({ defaults: { [harness]: defaults } })
  }, [updatePrefs])

  const getDefaults = useCallback((harness: string): HarnessDefaults => {
    return prefs.defaults?.[harness] ?? {}
  }, [prefs.defaults])

  const setLastInstance = useCallback((harness: string, instanceId: string) => {
    updatePrefs({ last_instance: { [harness]: instanceId } })
  }, [updatePrefs])

  const getLastInstance = useCallback((harness: string): string | null => {
    return prefs.last_instance?.[harness] ?? null
  }, [prefs.last_instance])

  const getLastSession = useCallback((harness: string): string | null => {
    return prefs.last_session?.[harness] ?? null
  }, [prefs.last_session])

  return {
    prefs,
    setLastHarness,
    setLastInstanceId,
    setLastSession,
    setLastInstance,
    setHarnessDefaults,
    getDefaults,
    getLastInstance,
    getLastSession,
  }
}
