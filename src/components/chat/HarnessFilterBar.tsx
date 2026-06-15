import { useMemo } from 'react'
import type { HarnessInfo, Machine, ManagedSession, SessionUIState } from '../../types'

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
// Sessions also carry orthogonal classification dimensions, each with its own
// labelled chip row below the machine/harness rows:
//   type     — interactive | autonomous | system  (how it runs; stored field)
//   purpose  — chat, autoworker, healthcheck, …    (what it's for; stored field)
//   mode     — events | pty                         (I/O transport; stored field)
//   status   — active, needs you, idle, …           (live state; DERIVED, see
//              sessionStatusGroup — bucketed from each session's UI state, not
//              a stored field)
// A session passes iff none of its classification values are excluded. Empty
// mode is normalised to "events" (legacy default); empty type/purpose/status
// carry no chip and are never excluded.
export const MODE_DEFAULT = 'events'

export function sessionMode(s: { mode?: string }): string {
  return s.mode || MODE_DEFAULT
}

// Coarse, human-meaningful buckets over the granular SessionUIState enum, for
// the Status filter row. We keep the underlying enum granular (it drives the
// status dot) and collapse to these buckets only at this presentation edge —
// ~14 raw states would be too many noisy chips. Groups mirror the conceptual
// sections documented on the SessionUIState type. UI-only/unknown states return
// '' (no chip, never excluded). Deprecated states (running, waiting_on_approval)
// are bucketed alongside the modern states they project to.
export type SessionStatusGroup = 'active' | 'needs you' | 'waiting' | 'idle' | 'done' | 'error'

export function sessionStatusGroup(uiState: SessionUIState | string): SessionStatusGroup | '' {
  switch (uiState) {
    case 'starting':
    case 'model_generating':
    case 'tool_running':
    case 'compacting':
    case 'running': // deprecated → tool_running
      return 'active'
    case 'awaiting_permission':
    case 'awaiting_user':
    case 'waiting_on_approval': // deprecated → awaiting_permission
      return 'needs you'
    case 'rate_limited':
    case 'paused':
      return 'waiting'
    case 'idle':
      return 'idle'
    case 'completed':
      return 'done'
    case 'error':
    case 'aborted':
    case 'disconnected':
      return 'error'
    default: // empty, placeholder, or unknown
      return ''
  }
}

type ClassDim = 'type' | 'purpose' | 'mode' | 'status'

interface HarnessFilterBarProps {
  machines: Machine[]
  harnesses: HarnessInfo[]
  sessions: ManagedSession[]
  instanceMachineByID: Map<string, string>
  excludedHarnesses: Set<string>
  excludedMachines: Set<string>
  excludedTypes: Set<string>
  excludedPurposes: Set<string>
  excludedModes: Set<string>
  excludedStatuses: Set<string>
  // Maps a session to its live status bucket (see sessionStatusGroup). Passed
  // in rather than derived here so the bar reuses the same canonical UI-state
  // derivation (getSessionUIState) that drives the status dot.
  statusOf: (s: ManagedSession) => string
  onToggleHarness: (harness: string) => void
  onToggleMachine: (machineId: string) => void
  onToggleClass: (dim: ClassDim, value: string) => void
  onClear: () => void
  basePath: string
  collapsed: boolean
  onToggleCollapsed: () => void
}

// One labelled row of text chips for a classification dimension. Values are
// derived from all sessions (so an excluded value keeps its chip and can be
// toggled back on); counts are over all sessions for predictability. The label
// carries a `hint` tooltip explaining what the dimension means.
function ClassFilterRow({ label, hint, values, counts, excluded, onToggle }: {
  label: string
  hint: string
  values: string[]
  counts: Map<string, number>
  excluded: Set<string>
  onToggle: (value: string) => void
}) {
  if (values.length <= 1) return null
  return (
    <div className="bc-inst-filter-chips bc-class-filter-row">
      <span className="bc-class-filter-label" title={hint}>{label}</span>
      {values.map(v => {
        const active = !excluded.has(v)
        const count = counts.get(v) ?? 0
        const tooltip = [
          v,
          `${count} session${count === 1 ? '' : 's'}`,
          `click to ${active ? 'hide' : 'show'}`,
        ].join('\n')
        return (
          <button
            key={v}
            type="button"
            className={`bc-inst-chip bc-class-chip ${active ? 'bc-inst-chip-active' : ''}`}
            onClick={() => onToggle(v)}
            title={tooltip}
          >
            <span className="bc-class-chip-name">{v}</span>
          </button>
        )
      })}
    </div>
  )
}

export function HarnessFilterBar({
  machines, harnesses, sessions, instanceMachineByID,
  excludedHarnesses, excludedMachines, excludedTypes, excludedPurposes, excludedModes, excludedStatuses,
  statusOf,
  onToggleHarness, onToggleMachine, onToggleClass, onClear, basePath,
  collapsed, onToggleCollapsed,
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

  // Distinct values + counts per classification dimension, over all sessions.
  const classDims = useMemo(() => {
    const tally = (pick: (s: typeof sessions[number]) => string | undefined) => {
      const counts = new Map<string, number>()
      for (const s of sessions) {
        const v = pick(s)
        if (!v) continue
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      const values = [...counts.keys()].sort((a, b) => a.localeCompare(b))
      return { values, counts }
    }
    return {
      type: tally(s => s.type),
      purpose: tally(s => s.purpose),
      mode: tally(s => sessionMode(s)),
      status: tally(s => statusOf(s)),
    }
  }, [sessions, statusOf])

  const hasClassRows =
    classDims.type.values.length > 1 ||
    classDims.purpose.values.length > 1 ||
    classDims.mode.values.length > 1 ||
    classDims.status.values.length > 1

  if (visibleHarnesses.length <= 1 && machines.length <= 1 && !hasClassRows) return null

  const activeCount = visibleHarnesses.filter(h => excludedHarnesses.has(h)).length
    + machines.filter(m => excludedMachines.has(m.id)).length
    + excludedTypes.size + excludedPurposes.size + excludedModes.size + excludedStatuses.size
  const anyExcluded = activeCount > 0

  return (
    <div className="bc-inst-filter">
      <button
        type="button"
        className={`bc-filter-toggle ${anyExcluded ? 'bc-filter-toggle-active' : ''}`}
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show session filters' : 'Hide session filters'}
      >
        <span className="bc-filter-chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="bc-filter-label">Filters</span>
        {anyExcluded && <span className="bc-filter-badge">{activeCount}</span>}
      </button>
      {!collapsed && (
      <div className="bc-inst-filter-body">
      {machines.length > 1 && (
        <div className="bc-inst-filter-chips bc-inst-filter-machines" title="Filter by the host machine the session runs on">
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
        <div className="bc-inst-filter-chips" title="Filter by agent harness (Claude Code, Codex, …)">
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
      <ClassFilterRow
        label="Type"
        hint="How the session runs: interactive (you're chatting), autonomous (fire-and-forget), or system (internal subsystems)"
        values={classDims.type.values}
        counts={classDims.type.counts}
        excluded={excludedTypes}
        onToggle={v => onToggleClass('type', v)}
      />
      <ClassFilterRow
        label="Purpose"
        hint="What the session is for: chat, autoworker, healthcheck, conformance, …"
        values={classDims.purpose.values}
        counts={classDims.purpose.counts}
        excluded={excludedPurposes}
        onToggle={v => onToggleClass('purpose', v)}
      />
      <ClassFilterRow
        label="Mode"
        hint="I/O transport: events (default) or pty (raw terminal)"
        values={classDims.mode.values}
        counts={classDims.mode.counts}
        excluded={excludedModes}
        onToggle={v => onToggleClass('mode', v)}
      />
      <ClassFilterRow
        label="Status"
        hint="Live state: active, needs you, waiting, idle, done, or error"
        values={classDims.status.values}
        counts={classDims.status.counts}
        excluded={excludedStatuses}
        onToggle={v => onToggleClass('status', v)}
      />
      {anyExcluded && (
        <button type="button" className="bc-inst-filter-clear" onClick={onClear} title="Show all sessions — clear every machine, harness, type, purpose, mode and status filter">
          show all
        </button>
      )}
      </div>
      )}
    </div>
  )
}
