import { useState, useEffect, useCallback, useMemo } from 'react'
import type { FetchFn, BridgePrefs, HarnessDefaults } from './types'

interface BridgePrefsOptions {
  /** If provided, prefs are synced to this server endpoint. Otherwise localStorage-only. */
  fetch?: FetchFn
  /** Server endpoint for prefs (e.g. "/api/session-meta/bridge"). Required if fetch is provided. */
  endpoint?: string
  /** localStorage key prefix (default: "bridge-prefs") */
  storagePrefix?: string
}

export function useBridgePrefs(options: BridgePrefsOptions = {}) {
  const { fetch: fetchFn, endpoint, storagePrefix = 'bridge-prefs' } = options
  const [prefs, setPrefs] = useState<BridgePrefs>({})
  // Flips true once the initial load resolves (from server or localStorage).
  // Consumers that key a first-render decision off a pref — e.g. the chat's
  // pending-new-chat bootstrap, which needs last_instance_id — gate on this
  // so they don't act on an empty prefs snapshot and pick the wrong default.
  const [loaded, setLoaded] = useState(false)
  const serverMode = !!(fetchFn && endpoint)

  // Load prefs on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (serverMode) {
        try {
          const res = await fetchFn!(endpoint!)
          if (res.ok) {
            const data: BridgePrefs = await res.json()
            if (!cancelled) setPrefs(data)
          }
        } catch { /* ignore */ }
      } else {
        // localStorage-only mode
        try {
          const stored = localStorage.getItem(storagePrefix)
          if (stored && !cancelled) setPrefs(JSON.parse(stored))
        } catch { /* ignore */ }
      }
      if (!cancelled) setLoaded(true)
    })()
    return () => { cancelled = true }
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

  return useMemo(() => ({
    prefs,
    loaded,
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
    loaded,
    setLastHarness,
    setLastInstanceId,
    setLastSession,
    setLastInstance,
    setHarnessDefaults,
    getDefaults,
    getLastInstance,
    getLastSession,
  ])
}
