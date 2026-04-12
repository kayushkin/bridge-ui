import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridgeConfig } from './context'
import type { BridgeInstance, InstanceStatus, InstanceCredential } from './types'

export function useBridgeInstances() {
  const { fetch: fetchFn, basePath } = useBridgeConfig()

  const [instances, setInstances] = useState<BridgeInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const lastJsonRef = useRef('')

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetchFn(`${basePath}/instances`)
      if (res.ok) {
        const data = await res.json() ?? []
        const json = JSON.stringify(data)
        if (json !== lastJsonRef.current) {
          lastJsonRef.current = json
          setInstances(data)
        }
        setError(null)
      } else {
        setError(`HTTP ${res.status}`)
      }
    } catch (err) {
      setError(`${err}`)
    } finally {
      setLoading(false)
    }
  }, [fetchFn, basePath])

  useEffect(() => {
    fetchInstances()
    const interval = setInterval(fetchInstances, 30000)
    return () => clearInterval(interval)
  }, [fetchInstances])

  const instancesByHarness = useCallback((harness: string): BridgeInstance[] => {
    return instances.filter(i => i.harness_type === harness && i.enabled)
  }, [instances])

  const createInstance = useCallback(async (data: Partial<BridgeInstance>): Promise<BridgeInstance | null> => {
    try {
      const res = await fetchFn(`${basePath}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) return null
      const inst: BridgeInstance = await res.json()
      await fetchInstances()
      return inst
    } catch { return null }
  }, [fetchFn, basePath, fetchInstances])

  const updateInstance = useCallback(async (id: string, data: Partial<BridgeInstance>): Promise<boolean> => {
    try {
      const res = await fetchFn(`${basePath}/instances/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) { await fetchInstances(); return true }
      return false
    } catch { return false }
  }, [fetchFn, basePath, fetchInstances])

  const deleteInstance = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetchFn(`${basePath}/instances/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) { await fetchInstances(); return true }
      return false
    } catch { return false }
  }, [fetchFn, basePath, fetchInstances])

  const getStatus = useCallback(async (id: string): Promise<InstanceStatus | null> => {
    try {
      const res = await fetchFn(`${basePath}/instances/${id}/status`)
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }, [fetchFn, basePath])

  const getCredentials = useCallback(async (id: string): Promise<InstanceCredential[]> => {
    try {
      const res = await fetchFn(`${basePath}/instances/${id}/credentials`)
      if (!res.ok) return []
      return await res.json() ?? []
    } catch { return [] }
  }, [fetchFn, basePath])

  const bindCredential = useCallback(async (instanceId: string, credentialId: string, priority: number, maxConcurrent: number): Promise<boolean> => {
    try {
      const res = await fetchFn(`${basePath}/instances/${instanceId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential_id: credentialId, priority, max_concurrent: maxConcurrent }),
      })
      return res.ok || res.status === 201
    } catch { return false }
  }, [fetchFn, basePath])

  const unbindCredential = useCallback(async (instanceId: string, credentialId: string): Promise<boolean> => {
    try {
      const res = await fetchFn(`${basePath}/instances/${instanceId}/credentials/${credentialId}`, {
        method: 'DELETE',
      })
      return res.ok || res.status === 204
    } catch { return false }
  }, [fetchFn, basePath])

  const instanceMap = useMemo(() => {
    const map = new Map<string, BridgeInstance>()
    for (const inst of instances) map.set(inst.id, inst)
    return map
  }, [instances])

  return {
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
  }
}
