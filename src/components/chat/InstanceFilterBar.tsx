import { useMemo } from 'react'
import type { BridgeInstance, HarnessInfo } from '../../types'

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
          const lines = [
            inst.name,
            `${info?.label || inst.harness_type} · ${inst.host}`,
            inst.working_dir ? `cwd: ${inst.working_dir}` : null,
            `${count} session${count === 1 ? '' : 's'}`,
            `click to ${active ? 'hide' : 'show'}`,
          ].filter(Boolean).join('\n')
          return (
            <button
              key={inst.id}
              type="button"
              className={`bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`}
              onClick={() => onToggle(inst.id)}
              title={lines}
            >
              {info?.image
                ? <img className="bc-inst-chip-img" src={`${basePath}${info.image}`} alt="" />
                : <span className="bc-inst-chip-emoji">{info?.emoji || '·'}</span>}
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
