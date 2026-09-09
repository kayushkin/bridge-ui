import { useEffect, useMemo, useRef } from 'react'
import { useBridgeHarnesses } from '../../useBridgeHarnesses'
import { useBridgeInstances } from '../../useBridgeInstances'
import { useBridgeMachines } from '../../useBridgeMachines'

interface NewSessionMenuProps {
  /** Called with the picked instance + its harness → useSessionActions().newSession. */
  onPick: (opts: { instanceId: string; harness: string }) => void
  onClose: () => void
}

/** Harness/instance picker grouped by harness, mirroring bridge-ui's NewSessionMenu
 *  DOM (bc-new-session-menu / bc-new-session-group / bc-new-session-item /
 *  bc-new-session-avail / …) so it inherits the shared stylesheet. Instance + machine
 *  metadata come from bridge-ui's config hooks (which read the BridgeProvider context
 *  the page mounts). Disabled instances are hidden; each row shows an availability
 *  dot, the instance name, and its machine. chat has no workspace splits, so the
 *  split-mode radiogroup is intentionally omitted.
 *
 *  Availability is per harness, not per instance: the server reports it on
 *  `HarnessInfo.available` and every instance of a harness whose process is gone is
 *  equally unreachable. It gates four things together — the dot's colour, the
 *  button's `disabled`, the title, and the click itself — because any one of them
 *  alone still leaves a row that lies. The click guard is not redundant with
 *  `disabled`: `disabled` is a property of the rendered button and says nothing
 *  about what the handler does when it is reached another way. */
export default function NewSessionMenu({ onPick, onClose }: NewSessionMenuProps) {
  const { instances } = useBridgeInstances()
  const { machineMap } = useBridgeMachines()
  const { harnessMap } = useBridgeHarnesses()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Bucket enabled instances by harness_type; groups ordered by harness name.
  const groups = useMemo(() => {
    const byHarness = new Map<string, typeof instances>()
    for (const inst of instances) {
      if (!inst.enabled) continue
      const list = byHarness.get(inst.harness_type) ?? []
      list.push(inst)
      byHarness.set(inst.harness_type, list)
    }
    return [...byHarness.entries()]
      .map(([harness, list]) => ({ harness, instances: list }))
      .sort((a, b) => a.harness.localeCompare(b.harness))
  }, [instances])

  return (
    <div className="bc-new-session-menu" role="menu" ref={menuRef}>
      {groups.length === 0 ? (
        <div className="bc-new-session-empty">No instances configured.</div>
      ) : (
        groups.map((g) => {
          // A harness the server has not registered has no entry, and the honest
          // reading of "the registry does not list it" is that it cannot be reached.
          // Defaulting the other way is what painted every row green.
          const available = harnessMap.get(g.harness)?.available ?? false
          return (
            <div key={g.harness} className="bc-new-session-group">
              <div className="bc-new-session-group-label">
                <span>{g.harness}</span>
              </div>
              {g.instances.map((inst) => {
                const machine = inst.machine ?? machineMap.get(inst.machine_id)
                return (
                  <button
                    key={inst.id}
                    type="button"
                    className="bc-new-session-item"
                    role="menuitem"
                    disabled={!available}
                    title={
                      available
                        ? `Create new session in ${inst.name}`
                        : `${g.harness} harness unavailable`
                    }
                    onClick={() => {
                      if (!available) return
                      onPick({ instanceId: inst.id, harness: inst.harness_type })
                      onClose()
                    }}
                  >
                    <span
                      className={`bc-new-session-avail ${available ? 'bc-new-session-avail-on' : 'bc-new-session-avail-off'}`}
                    />
                    <span className="bc-new-session-item-name">{inst.name}</span>
                    <span className="bc-new-session-item-meta">
                      {machine?.emoji ? `${machine.emoji} ` : ''}
                      {machine?.name || '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
