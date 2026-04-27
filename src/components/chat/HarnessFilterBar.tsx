import { useMemo } from 'react'
import type { HarnessInfo, Machine } from '../../types'

// Two coordinated multi-select rows in the session sidebar:
//
//   Machines row:    one chip per machine. Hidden machines drop every
//                    session bound to them out of both this filter and
//                    the session list.
//   Harnesses row:   one chip per harness present among sessions on
//                    visible machines. Hidden harnesses drop their
//                    sessions only.
//
// A session passes iff its harness is not excluded AND its instance's
// machine_id is not excluded.
interface HarnessFilterBarProps {
  machines: Machine[]
  harnesses: HarnessInfo[]
  sessions: Array<{ harness: string; instance_id?: string }>
  instanceMachineByID: Map<string, string>
  excludedHarnesses: Set<string>
  excludedMachines: Set<string>
  onToggleHarness: (harness: string) => void
  onToggleMachine: (machineId: string) => void
  onClear: () => void
  basePath: string
}

export function HarnessFilterBar({
  machines, harnesses, sessions, instanceMachineByID,
  excludedHarnesses, excludedMachines,
  onToggleHarness, onToggleMachine, onClear, basePath,
}: HarnessFilterBarProps) {
  const harnessMap = useMemo(() => {
    const m = new Map<string, HarnessInfo>()
    for (const h of harnesses) m.set(h.name, h)
    return m
  }, [harnesses])

  const { harnessCounts, machineCounts, visibleHarnessNames } = useMemo(() => {
    const hCounts = new Map<string, number>()
    const mCounts = new Map<string, number>()
    const visible = new Set<string>()
    for (const s of sessions) {
      const machineID = s.instance_id ? instanceMachineByID.get(s.instance_id) : undefined
      if (machineID) mCounts.set(machineID, (mCounts.get(machineID) ?? 0) + 1)
      if (machineID && excludedMachines.has(machineID)) continue
      hCounts.set(s.harness, (hCounts.get(s.harness) ?? 0) + 1)
      visible.add(s.harness)
    }
    return { harnessCounts: hCounts, machineCounts: mCounts, visibleHarnessNames: visible }
  }, [sessions, instanceMachineByID, excludedMachines])

  const visibleHarnesses = useMemo(() => {
    const names = [...visibleHarnessNames]
    names.sort((a, b) => {
      const la = harnessMap.get(a)?.label ?? a
      const lb = harnessMap.get(b)?.label ?? b
      return la.localeCompare(lb)
    })
    return names
  }, [visibleHarnessNames, harnessMap])

  if (visibleHarnesses.length <= 1 && machines.length <= 1) return null

  const anyExcluded = visibleHarnesses.some(h => excludedHarnesses.has(h))
    || machines.some(m => excludedMachines.has(m.id))

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
      {visibleHarnesses.length > 1 && (
        <div className="bc-inst-filter-chips">
          {visibleHarnesses.map(h => {
            const info = harnessMap.get(h)
            const active = !excludedHarnesses.has(h)
            const count = harnessCounts.get(h) ?? 0
            const lines = [
              info?.label || h,
              `${count} session${count === 1 ? '' : 's'}`,
              `click to ${active ? 'hide' : 'show'}`,
            ].filter(Boolean).join('\n')
            return (
              <button
                key={h}
                type="button"
                className={`bc-inst-chip ${active ? 'bc-inst-chip-active' : ''}`}
                onClick={() => onToggleHarness(h)}
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
        <button type="button" className="bc-inst-filter-clear" onClick={onClear} title="Show sessions from all machines and harnesses">
          show all
        </button>
      )}
    </div>
  )
}
