import { useMemo } from 'react'
import type { BridgeInstance, HarnessInfo, Machine } from '../../types'

// SessionFilterBar (file-named InstanceFilterBar for backward compat)
// renders two coordinated multi-select rows in the session sidebar:
//
//   Machines row:    one chip per machine. Hidden machines drop every
//                    instance bound to them out of both this filter and
//                    the session list.
//   Instances row:   one chip per instance whose machine is currently
//                    visible. Hidden instances drop their sessions only.
//
// Two collapsing rows give the user "filter by host" without losing
// finer-grained control. A session passes iff its instance_id is not
// excluded AND its instance's machine_id is not excluded.
interface InstanceFilterBarProps {
  instances: BridgeInstance[]
  machines: Machine[]
  harnesses: HarnessInfo[]
  sessions: Array<{ instance_id?: string }>
  excluded: Set<string>          // instance ids blacklist
  excludedMachines: Set<string>  // machine ids blacklist
  onToggle: (instanceId: string) => void
  onToggleMachine: (machineId: string) => void
  onClear: () => void
  basePath: string
}

export function InstanceFilterBar({
  instances, machines, harnesses, sessions, excluded, excludedMachines,
  onToggle, onToggleMachine, onClear, basePath,
}: InstanceFilterBarProps) {
  const harnessMap = useMemo(() => {
    const m = new Map<string, HarnessInfo>()
    for (const h of harnesses) m.set(h.name, h)
    return m
  }, [harnesses])

  const machineMap = useMemo(() => {
    const m = new Map<string, Machine>()
    for (const x of machines) m.set(x.id, x)
    return m
  }, [machines])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sessions) {
      if (!s.instance_id) continue
      m.set(s.instance_id, (m.get(s.instance_id) ?? 0) + 1)
    }
    return m
  }, [sessions])

  const machineCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const inst of instances) {
      const c = counts.get(inst.id) ?? 0
      m.set(inst.machine_id, (m.get(inst.machine_id) ?? 0) + c)
    }
    return m
  }, [instances, counts])

  const enabled = useMemo(() => instances.filter(i => i.enabled), [instances])

  const visibleInstances = useMemo(
    () => enabled.filter(i => !excludedMachines.has(i.machine_id)),
    [enabled, excludedMachines],
  )

  // Hide the bar entirely when there's nothing meaningful to filter on —
  // single instance + single machine = no choice to make.
  if (enabled.length <= 1 && machines.length <= 1) return null

  const anyExcluded = enabled.some(i => excluded.has(i.id)) || machines.some(m => excludedMachines.has(m.id))

  return (
    <div className="bc-inst-filter">
      {machines.length > 1 && (
        <div className="bc-inst-filter-chips bc-inst-filter-machines">
          {machines.map(m => {
            const active = !excludedMachines.has(m.id)
            const count = machineCounts.get(m.id) ?? 0
            const tooltip = [
              m.name,
              m.hostname || `transport: ${m.transport}`,
              `${count} session${count === 1 ? '' : 's'}`,
              `click to ${active ? 'hide' : 'show'}`,
            ].filter(Boolean).join('\n')
            return (
              <button
                key={m.id}
                type="button"
                className={`bc-inst-chip bc-machine-chip ${active ? 'bc-inst-chip-active' : ''}`}
                onClick={() => onToggleMachine(m.id)}
                title={tooltip}
              >
                {m.emoji
                  ? <span className="bc-inst-chip-emoji">{m.emoji}</span>
                  : <span className="bc-inst-chip-emoji" aria-hidden>🖥</span>}
                <span className="bc-machine-chip-name">{m.name}</span>
              </button>
            )
          })}
        </div>
      )}
      {visibleInstances.length > 1 && (
        <div className="bc-inst-filter-chips">
          {visibleInstances.map(inst => {
            const info = harnessMap.get(inst.harness_type)
            const machine = machineMap.get(inst.machine_id)
            const active = !excluded.has(inst.id)
            const count = counts.get(inst.id) ?? 0
            const lines = [
              inst.name,
              `${info?.label || inst.harness_type} · ${machine?.name ?? '?'}`,
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
      )}
      {anyExcluded && (
        <button type="button" className="bc-inst-filter-clear" onClick={onClear} title="Show sessions from all machines and instances">
          show all
        </button>
      )}
    </div>
  )
}
