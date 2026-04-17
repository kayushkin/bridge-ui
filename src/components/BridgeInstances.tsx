import { useCallback, useEffect, useState } from 'react'
import { useBridgeConfig } from '../context'
import { useBridgeInstances } from '../useBridgeInstances'
import { TRANSPORT_LABEL } from '../constants'
import type { BridgeInstance, InstanceStatus, InstanceCredential, HarnessInfo } from '../types'
import type { Credential } from '@kayushkin/llm-bridge-types'

export function BridgeInstances() {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const inst = useBridgeInstances()
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', harness_type: 'claude_code', host: 'localhost', transport: 'local' as 'local' | 'ssh', ssh_user: '', ssh_key_path: '', ssh_port: 22, working_dir: '', max_concurrent_sessions: 1 })
  const [statusCache, setStatusCache] = useState<Record<string, InstanceStatus>>({})
  const [credCache, setCredCache] = useState<Record<string, InstanceCredential[]>>({})
  const [expandedCreds, setExpandedCreds] = useState<Record<string, boolean>>({})
  const [bindForm, setBindForm] = useState<{ instanceId: string; credential_id: string; priority: number; max_concurrent: number } | null>(null)

  useEffect(() => {
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
    apiFetch(`${basePath}/credentials`).then(r => r.ok ? r.json() : []).then(setCredentials).catch(() => {})
  }, [apiFetch, basePath])

  useEffect(() => {
    for (const i of inst.instances) {
      inst.getStatus(i.id).then(s => { if (s) setStatusCache(prev => ({ ...prev, [i.id]: s })) })
      inst.getCredentials(i.id).then(c => setCredCache(prev => ({ ...prev, [i.id]: c })))
    }
  }, [inst.instances, inst.getStatus, inst.getCredentials])

  const resetForm = () => {
    setForm({ name: '', harness_type: 'claude_code', host: 'localhost', transport: 'local', ssh_user: '', ssh_key_path: '', ssh_port: 22, working_dir: '', max_concurrent_sessions: 1 })
    setEditId(null)
    setShowForm(false)
  }

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) return
    if (editId) await inst.updateInstance(editId, form)
    else await inst.createInstance(form)
    resetForm()
  }, [form, editId, inst])

  const startEdit = (i: BridgeInstance) => {
    setForm({ name: i.name, harness_type: i.harness_type, host: i.host, transport: (i.transport === 'ssh' ? 'ssh' : 'local'), ssh_user: i.ssh_user ?? '', ssh_key_path: i.ssh_key_path ?? '', ssh_port: i.ssh_port ?? 22, working_dir: i.working_dir ?? '', max_concurrent_sessions: i.max_concurrent_sessions })
    setEditId(i.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this instance?')) return
    await inst.deleteInstance(id)
  }

  const toggleCreds = (id: string) => setExpandedCreds(prev => ({ ...prev, [id]: !prev[id] }))

  const handleBind = async () => {
    if (!bindForm) return
    const ok = await inst.bindCredential(bindForm.instanceId, bindForm.credential_id, bindForm.priority, bindForm.max_concurrent)
    if (ok) {
      const creds = await inst.getCredentials(bindForm.instanceId)
      setCredCache(prev => ({ ...prev, [bindForm.instanceId]: creds }))
      setBindForm(null)
    }
  }

  const handleUnbind = async (instanceId: string, credId: string) => {
    const ok = await inst.unbindCredential(instanceId, credId)
    if (ok) {
      const creds = await inst.getCredentials(instanceId)
      setCredCache(prev => ({ ...prev, [instanceId]: creds }))
    }
  }

  const groups = new Map<string, BridgeInstance[]>()
  for (const i of inst.instances) {
    const list = groups.get(i.harness_type) || []
    list.push(i)
    groups.set(i.harness_type, list)
  }

  return (
    <div className="bi-container">
      <div className="bi-header">
        <h2>Harness Instances</h2>
        <button className="bi-add-btn" onClick={() => { resetForm(); setShowForm(true) }}>+ Add Instance</button>
      </div>

      {showForm && (
        <div className="bi-form-card">
          <div className="bi-form-grid">
            <label><span>Name</span><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-instance" /></label>
            <label><span>Harness</span>
              <select value={form.harness_type} onChange={e => setForm(f => ({ ...f, harness_type: e.target.value }))}>
                {harnesses.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
              </select>
            </label>
            <label><span>Host</span><input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="localhost" /></label>
            <label><span>Transport</span>
              <select value={form.transport} onChange={e => setForm(f => ({ ...f, transport: e.target.value as 'local' | 'ssh' }))}>
                <option value="local">Local</option>
                <option value="ssh">SSH</option>
              </select>
            </label>
            {form.transport === 'ssh' && (
              <>
                <label><span>SSH User</span><input value={form.ssh_user} onChange={e => setForm(f => ({ ...f, ssh_user: e.target.value }))} /></label>
                <label><span>SSH Key Path</span><input value={form.ssh_key_path} onChange={e => setForm(f => ({ ...f, ssh_key_path: e.target.value }))} /></label>
                <label><span>SSH Port</span><input type="number" value={form.ssh_port} onChange={e => setForm(f => ({ ...f, ssh_port: parseInt(e.target.value) || 22 }))} /></label>
              </>
            )}
            <label><span>Working Dir</span><input value={form.working_dir} onChange={e => setForm(f => ({ ...f, working_dir: e.target.value }))} placeholder="/home/user/project" /></label>
            <label><span>Max Sessions</span><input type="number" value={form.max_concurrent_sessions} onChange={e => setForm(f => ({ ...f, max_concurrent_sessions: parseInt(e.target.value) || 1 }))} min={1} /></label>
          </div>
          <div className="bi-form-actions">
            <button className="bi-save-btn" onClick={handleSubmit}>{editId ? 'Update' : 'Create'}</button>
            <button className="bi-cancel-btn" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {inst.loading && <div className="bi-loading">Loading...</div>}
      {inst.error && <div className="bridge-error">{inst.error}</div>}

      {Array.from(groups.entries()).map(([harness, items]) => (
        <div key={harness} className="bi-group">
          <h3 className="bi-group-title">{harness}</h3>
          <div className="bi-card-grid">
            {items.map(item => {
              const status = statusCache[item.id]
              const creds = credCache[item.id] || []
              const expanded = expandedCreds[item.id]
              return (
                <div key={item.id} className="bi-card">
                  <div className="bi-card-header">
                    <span className="bi-card-name">{item.name}</span>
                    <span className={`bi-transport ${item.transport === 'ssh' ? 'bi-transport-ssh' : ''}`}>{TRANSPORT_LABEL[item.transport]}</span>
                    {status && <span className={`bi-reach ${status.reachable ? 'bi-reach-ok' : 'bi-reach-fail'}`} title={status.reachable ? 'Reachable' : 'Unreachable'} />}
                  </div>
                  <div className="bi-card-meta">
                    <span>{item.host}</span>
                    {item.transport === 'ssh' && <span>{item.ssh_user}@:{item.ssh_port || 22}</span>}
                    {item.working_dir && <span>{item.working_dir}</span>}
                  </div>
                  <div className="bi-card-stats">
                    <span>Sessions: {status?.active_sessions ?? 0} / {item.max_concurrent_sessions}</span>
                    <span>Credentials: {creds.length}</span>
                  </div>

                  <button className="bi-cred-toggle" onClick={() => toggleCreds(item.id)}>
                    {expanded ? '\u25BE' : '\u25B8'} Credentials ({creds.length})
                  </button>
                  {expanded && (
                    <div className="bi-cred-section">
                      {creds.map(c => {
                        const slotInfo = status?.credentials?.find(s => s.credential_id === c.credential_id)
                        return (
                          <div key={c.credential_id} className="bi-cred-row">
                            <span className="bi-cred-id">{c.credential_id}</span>
                            <span className="bi-cred-pri">pri {c.priority}</span>
                            {slotInfo?.enabled && <span className="bi-cred-slots">active</span>}
                            <button className="bi-cred-unbind" onClick={() => handleUnbind(item.id, c.credential_id)}>x</button>
                          </div>
                        )
                      })}
                      {bindForm?.instanceId === item.id ? (
                        <div className="bi-bind-form">
                          <select value={bindForm.credential_id} onChange={e => setBindForm(f => f ? { ...f, credential_id: e.target.value } : f)}>
                            <option value="">Select credential</option>
                            {credentials.filter(c => c.enabled).map(c => (
                              <option key={c.id} value={c.id}>{c.label || c.id} ({c.provider})</option>
                            ))}
                          </select>
                          <input type="number" placeholder="Pri" value={bindForm.priority} onChange={e => setBindForm(f => f ? { ...f, priority: parseInt(e.target.value) || 0 } : f)} style={{ width: 50 }} />
                          <input type="number" placeholder="Max" value={bindForm.max_concurrent} onChange={e => setBindForm(f => f ? { ...f, max_concurrent: parseInt(e.target.value) || 1 } : f)} style={{ width: 50 }} />
                          <button className="bi-save-btn" onClick={handleBind}>Bind</button>
                          <button className="bi-cancel-btn" onClick={() => setBindForm(null)}>x</button>
                        </div>
                      ) : (
                        <button className="bi-bind-btn" onClick={() => setBindForm({ instanceId: item.id, credential_id: '', priority: 0, max_concurrent: 1 })}>+ Bind credential</button>
                      )}
                    </div>
                  )}

                  <div className="bi-card-actions">
                    <button onClick={() => startEdit(item)}>Edit</button>
                    <button className="bi-delete-btn" onClick={() => handleDelete(item.id)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {!inst.loading && inst.instances.length === 0 && (
        <div className="bi-empty">No instances configured. Click "Add Instance" to create one.</div>
      )}
    </div>
  )
}
