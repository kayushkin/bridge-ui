import { useMemo } from 'react'
import type { BridgeInstance, HarnessInfo } from '../../types'
import { HARNESS_EMOJI } from '../../constants'

interface InstanceFilterBarProps {
  instances: BridgeInstance[]
  harnesses: HarnessInfo[]
  sessions: Array<{ instance_id?: string }>
  excluded: Set<string>
  onToggle: (instanceId: string) => void
  onClear: () => void
  basePath: string
}

export function InstanceFilterBar({ instances, harnesses, sessions, excluded, onToggle, onClear, basePath }: InstanceFilterBarProps) {
  const harnessMap = useMemo(() => {
    const m = new Map<string, HarnessInfo>()
    for (const h of harnesses) m.set(h.name, h)
    return m
  }, [harnesses])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sessions) {
      if (!s.instance_id) continue
      m.set(s.instance_id, (m.get(s.instance_id) ?? 0) + 1)
    }
    return m
  }, [sessions])

  const enabled = useMemo(() => instances.filter(i => i.enabled), [instances])
  if (enabled.length <= 1) return null

  const anyExcluded = enabled.some(i => excluded.has(i.id))

  return (
    <div className="bc-inst-filter">
      <div className="bc-inst-filter-chips">
        {enabled.map(inst => {
          const info = harnessMap.get(inst.harness_type)
          const active = !excluded.has(inst.id)
          const count = counts.get(inst.id) ?? 0
          return (
            <button
              key={inst.id}
              type="button"
              className={`bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`}
              onClick={() => onToggle(inst.id)}
              title={`${inst.name} — click to ${active ? 'hide' : 'show'} sessions`}
            >
              {info?.image
                ? <img className="bc-inst-chip-img" src={`${basePath}${info.image}`} alt="" />
                : <span className="bc-inst-chip-emoji">{info?.emoji || HARNESS_EMOJI[inst.harness_type] || '·'}</span>}
              <span className="bc-inst-chip-name">{inst.name}</span>
              {count > 0 && <span className="bc-inst-chip-count">{count}</span>}
            </button>
          )
        })}
      </div>
      {anyExcluded && (
        <button type="button" className="bc-inst-filter-clear" onClick={onClear} title="Show sessions from all instances">
          show all
        </button>
      )}
    </div>
  )
}
