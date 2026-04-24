import { useState } from 'react'
import type { HarnessInfo } from '../../types'

export function NewInstanceForm({ harnesses, onCreate, onCancel }: {
  harnesses: HarnessInfo[]
  onCreate: (data: { name: string; harness_type: string; host: string; transport: 'local' | 'ssh'; working_dir: string; max_concurrent_sessions: number }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: '', harness_type: harnesses[0]?.name || 'claude_code', host: 'localhost',
    transport: 'local' as 'local' | 'ssh', working_dir: '', max_concurrent_sessions: 1,
  })

  return (
    <div className="bc-new-inst-overlay" onClick={onCancel}>
      <div className="bc-new-inst-form" onClick={e => e.stopPropagation()}>
        <h3>New Instance</h3>
        <label><span>Name</span><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-instance" /></label>
        <label><span>Harness</span>
          <select value={form.harness_type} onChange={e => setForm(f => ({ ...f, harness_type: e.target.value }))}>
            {harnesses.map(h => <option key={h.name} value={h.name}>{h.label || h.name}</option>)}
          </select>
        </label>
        <label><span>Host</span><input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="localhost" /></label>
        <label><span>Transport</span>
          <select value={form.transport} onChange={e => setForm(f => ({ ...f, transport: e.target.value as 'local' | 'ssh' }))}>
            <option value="local">Local</option>
            <option value="ssh">SSH</option>
          </select>
        </label>
        <label><span>Working Dir</span><input value={form.working_dir} onChange={e => setForm(f => ({ ...f, working_dir: e.target.value }))} placeholder="/home/user/project" /></label>
        <label><span>Max Sessions</span><input type="number" value={form.max_concurrent_sessions} onChange={e => setForm(f => ({ ...f, max_concurrent_sessions: parseInt(e.target.value) || 1 }))} min={1} /></label>
        <div className="bc-new-inst-actions">
          <button onClick={() => { if (form.name.trim()) onCreate(form) }} disabled={!form.name.trim()}>Create</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
