import { useCallback, useEffect, useState } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import type { BridgeInstance, InstanceCredential } from '../types'
import type { Credential } from '@kayushkin/llm-bridge-types'

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
]

export function BridgeAuth() {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddKey, setShowAddKey] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', provider: 'anthropic', api_key: '' })
  const [saving, setSaving] = useState(false)
  const instances = useBridgeInstances()
  const [bindingsCache, setBindingsCache] = useState<Record<string, InstanceCredential[]>>({})
  const [expandedCred, setExpandedCred] = useState<string | null>(null)
  const [bindForm, setBindForm] = useState<{ credentialId: string; instance_id: string; priority: number; max_concurrent: number } | null>(null)

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await apiFetch(`${basePath}/credentials`)
      if (!res.ok) { setError(`HTTP ${res.status}`); return }
      setCredentials(await res.json() || [])
      setError(null)
    } catch (err) { setError(`${err}`) }
    finally { setLoading(false) }
  }, [apiFetch, basePath])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  useEffect(() => {
    for (const inst of instances.instances) {
      instances.getCredentials(inst.id).then(creds => {
        setBindingsCache(prev => ({ ...prev, [inst.id]: creds }))
      })
    }
  }, [instances.instances, instances.getCredentials])

  const toggleCredential = useCallback(async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`${basePath}/credentials/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
      setCredentials(prev => prev.map(c => c.id === id ? { ...c, enabled } : c))
    } catch { /* ignore */ }
  }, [apiFetch, basePath])

  const handleAddKey = useCallback(async () => {
    if (!addForm.name.trim() || !addForm.api_key.trim()) return
    setSaving(true)
    try {
      const res = await apiFetch(`${basePath}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addForm.name.trim(), provider: addForm.provider, type: 'api_key', key: addForm.api_key.trim() }),
      })
      if (!res.ok) { setError(`Failed to add key: ${res.statusText}`); return }
      setAddForm({ name: '', provider: 'anthropic', api_key: '' })
      setShowAddKey(false)
      await fetchCredentials()
    } catch (err) { setError(`Failed to add key: ${err}`) }
    finally { setSaving(false) }
  }, [addForm, fetchCredentials, apiFetch, basePath])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(`Delete credential "${id}"?`)) return
    try {
      const res = await apiFetch(`${basePath}/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) await fetchCredentials()
      else setError(`Delete failed: ${res.statusText}`)
    } catch (err) { setError(`Delete failed: ${err}`) }
  }, [fetchCredentials, apiFetch, basePath])

  const credentialBindings = useCallback((credId: string): Array<{ instance: BridgeInstance; binding: InstanceCredential }> => {
    const results: Array<{ instance: BridgeInstance; binding: InstanceCredential }> = []
    for (const inst of instances.instances) {
      const bindings = bindingsCache[inst.id] || []
      const binding = bindings.find(b => b.credential_id === credId)
      if (binding) results.push({ instance: inst, binding })
    }
    return results
  }, [instances.instances, bindingsCache])

  const handleBind = useCallback(async () => {
    if (!bindForm) return
    const ok = await instances.bindCredential(bindForm.instance_id, bindForm.credentialId, bindForm.priority, bindForm.max_concurrent)
    if (ok) {
      const creds = await instances.getCredentials(bindForm.instance_id)
      setBindingsCache(prev => ({ ...prev, [bindForm.instance_id]: creds }))
      setBindForm(null)
    }
  }, [bindForm, instances])

  const handleUnbind = useCallback(async (instanceId: string, credId: string) => {
    const ok = await instances.unbindCredential(instanceId, credId)
    if (ok) {
      const creds = await instances.getCredentials(instanceId)
      setBindingsCache(prev => ({ ...prev, [instanceId]: creds }))
    }
  }, [instances])

  const isExpired = (expiresAt: number) => expiresAt > 0 && expiresAt < Date.now()

  return (
    <div className="ba-container">
      <div className="ba-header">
        <h2>Auth Management</h2>
        <button className="ba-add-btn" onClick={() => setShowAddKey(true)}>+ Add API Key</button>
      </div>

      {error && <div className="bridge-error">{error} <button className="ba-dismiss" onClick={() => setError(null)}>dismiss</button></div>}

      {showAddKey && (
        <div className="ba-form-card">
          <h3>Add API Key</h3>
          <div className="ba-form-grid">
            <label><span>Name / Label</span><input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="my-anthropic-key" /></label>
            <label><span>Provider</span>
              <select value={addForm.provider} onChange={e => setAddForm(f => ({ ...f, provider: e.target.value }))}>
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="ba-span-full"><span>API Key</span><input type="password" value={addForm.api_key} onChange={e => setAddForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-ant-..." /></label>
          </div>
          <div className="ba-form-actions">
            <button className="ba-save-btn" onClick={handleAddKey} disabled={saving || !addForm.name.trim() || !addForm.api_key.trim()}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="ba-cancel-btn" onClick={() => { setShowAddKey(false); setAddForm({ name: '', provider: 'anthropic', api_key: '' }) }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="ba-loading">Loading credentials...</div>
      ) : credentials.length === 0 ? (
        <div className="ba-empty">No credentials configured. Add an API key to get started.</div>
      ) : (
        <div className="ba-cred-grid">
          {credentials.map(cred => {
            const bindings = credentialBindings(cred.id)
            const isExp = isExpired(cred.expires_at)
            const expanded = expandedCred === cred.id

            return (
              <div key={cred.id} className={`ba-cred-card ${!cred.enabled ? 'ba-cred-disabled' : ''} ${isExp ? 'ba-cred-expired' : ''}`}>
                <div className="ba-cred-header">
                  <span className="ba-cred-provider">{cred.provider}</span>
                  <span className="ba-cred-label">{cred.label}</span>
                  <span className="ba-auth-type">{cred.auth_type}</span>
                  {isExp && <span className="ba-expired-badge">expired</span>}
                </div>

                <div className="ba-cred-details">
                  {cred.api_key_masked && <span className="ba-masked-key">{cred.api_key_masked}</span>}
                  {cred.token_masked && <span className="ba-masked-key">{cred.token_masked}</span>}
                  {(cred.error_count ?? 0) > 0 && <span className="ba-error-count">{cred.error_count} errors</span>}
                  {cred.last_error && <span className="ba-last-error" title={cred.last_error}>{cred.last_error}</span>}
                </div>

                <button className="ba-bindings-toggle" onClick={() => setExpandedCred(expanded ? null : cred.id)}>
                  {expanded ? '\u25BE' : '\u25B8'} Bound to {bindings.length} instance{bindings.length !== 1 ? 's' : ''}
                </button>

                {expanded && (
                  <div className="ba-bindings-section">
                    {bindings.map(({ instance, binding }) => (
                      <div key={instance.id} className="ba-binding-row">
                        <span>{instance.name}</span>
                        <span className="ba-binding-pri">pri {binding.priority}</span>
                        <button className="ba-unbind-btn" onClick={() => handleUnbind(instance.id, cred.id)}>x</button>
                      </div>
                    ))}
                    {bindForm?.credentialId === cred.id ? (
                      <div className="ba-bind-form">
                        <select value={bindForm.instance_id} onChange={e => setBindForm(f => f ? { ...f, instance_id: e.target.value } : f)}>
                          <option value="">Select instance</option>
                          {instances.instances.filter(i => i.enabled && !bindings.some(b => b.instance.id === i.id)).map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.harness_type})</option>
                          ))}
                        </select>
                        <input type="number" placeholder="Pri" value={bindForm.priority} onChange={e => setBindForm(f => f ? { ...f, priority: parseInt(e.target.value) || 0 } : f)} style={{ width: 50 }} />
                        <input type="number" placeholder="Max" value={bindForm.max_concurrent} onChange={e => setBindForm(f => f ? { ...f, max_concurrent: parseInt(e.target.value) || 1 } : f)} style={{ width: 50 }} />
                        <button className="ba-save-btn" onClick={handleBind} disabled={!bindForm.instance_id}>Bind</button>
                        <button className="ba-cancel-btn" onClick={() => setBindForm(null)}>x</button>
                      </div>
                    ) : (
                      <button className="ba-add-bind-btn" onClick={() => setBindForm({ credentialId: cred.id, instance_id: '', priority: 0, max_concurrent: 1 })}>+ Bind to instance</button>
                    )}
                  </div>
                )}

                <div className="ba-cred-actions">
                  <button className={`ba-toggle-btn ${cred.enabled ? 'ba-toggle-on' : 'ba-toggle-off'}`} onClick={() => toggleCredential(cred.id, !cred.enabled)}>
                    {cred.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button className="ba-delete-btn" onClick={() => handleDelete(cred.id)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
