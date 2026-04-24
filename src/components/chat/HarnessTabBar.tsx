import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { HarnessInfo } from '../../types'
import { HARNESS_EMOJI, TRANSPORT_LABEL } from '../../constants'

export function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath, onToggleCollapse }: {
  instances: Array<{ id: string; name: string; harness_type: string; host: string; transport: string; enabled: boolean }>
  harnesses: HarnessInfo[]
  sessions: Array<{ instance_id?: string; state: string }>
  selectedInstance: string
  onSelect: (id: string) => void
  onNewInstance: () => void
  basePath: string
  instancesPath: string
  onToggleCollapse: () => void
}) {
  const harnessMap = useMemo(() => {
    const map = new Map<string, HarnessInfo>()
    for (const h of harnesses) map.set(h.name, h)
    return map
  }, [harnesses])

  const groups = useMemo(() => {
    const groupMap = new Map<string, typeof instances>()
    for (const inst of instances) {
      if (!inst.enabled) continue
      const list = groupMap.get(inst.harness_type) || []
      list.push(inst)
      groupMap.set(inst.harness_type, list)
    }
    const order = harnesses.map(h => h.name)
    return Array.from(groupMap.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [instances, harnesses])

  const instanceMeta = useMemo(() => {
    const meta = new Map<string, { running: number; total: number }>()
    for (const inst of instances) {
      const s = sessions.filter(s => s.instance_id === inst.id)
      meta.set(inst.id, { running: s.filter(s => s.state === 'running').length, total: s.length })
    }
    return meta
  }, [instances, sessions])

  if (groups.length === 0) {
    return (
      <div className="htb-wrapper">
        <button className="htb-collapse-btn" onClick={onToggleCollapse} title="Collapse harness bar" aria-label="Collapse harness bar">▴</button>
        <div className="htb-empty">No harness instances configured. <Link to={instancesPath}>Add an instance</Link> to get started.</div>
        <button className="htb-new-instance" onClick={onNewInstance} title="Add new instance">+</button>
      </div>
    )
  }

  return (
    <div className="htb-wrapper">
      <button className="htb-collapse-btn" onClick={onToggleCollapse} title="Collapse harness bar" aria-label="Collapse harness bar">▴</button>
      <div className="htb-tabs">
        {groups.map(([harnessType, groupInstances], gi) => {
          const info = harnessMap.get(harnessType)
          return (
            <div key={harnessType} className="htb-group">
              {gi > 0 && <div className="htb-sep" />}
              {groups.length > 1 && (
                <div className="htb-group-label">
                  {info?.image
                    ? <img className="htb-group-img" src={`${basePath}${info.image}`} alt={info?.label || harnessType} />
                    : <span>{info?.emoji || HARNESS_EMOJI[harnessType] || ''}</span>}
                </div>
              )}
              {groupInstances.map(inst => {
                const m = instanceMeta.get(inst.id)
                const isActive = selectedInstance === inst.id
                const available = info?.available ?? false
                return (
                  <button
                    key={inst.id}
                    className={`htb-tab ${isActive ? 'htb-tab-active' : ''} ${!available ? 'htb-tab-disabled' : ''}`}
                    onClick={() => available && onSelect(inst.id)}
                    disabled={!available}
                    title={`${inst.name} (${TRANSPORT_LABEL[inst.transport] || inst.transport} - ${inst.host})`}
                  >
                    <div className="htb-tab-line1">
                      <span className={`htb-avail ${available ? 'htb-avail-on' : 'htb-avail-off'}`} />
                      {groups.length <= 1 && (info?.image
                        ? <img className="htb-tab-img" src={`${basePath}${info.image}`} alt="" />
                        : <span className="htb-tab-emoji">{info?.emoji || HARNESS_EMOJI[harnessType] || ''}</span>)}
                      <span className="htb-tab-name">{inst.name}</span>
                      <span className="htb-transport">{TRANSPORT_LABEL[inst.transport] || inst.transport}</span>
                    </div>
                    {m && (
                      <div className="htb-tab-line2">
                        {m.running > 0 ? `${m.running} running` : m.total > 0 ? `${m.total} sess` : 'no sessions'}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
        <button className="htb-new-instance" onClick={onNewInstance} title="Add new instance">+</button>
      </div>
    </div>
  )
}
