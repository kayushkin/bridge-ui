import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BridgeInstance, HarnessInfo } from '../../types'
import { SplitButtons } from './SplitButtons'
import type { SplitMode } from './types'

const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  'replace':     'Replace current',
  'split-auto':  'Split (auto)',
  'split-left':  'Split left',
  'split-right': 'Split right',
  'split-up':    'Split above',
  'split-down':  'Split below',
}

interface NewSessionMenuProps {
  instances: BridgeInstance[]
  harnesses: HarnessInfo[]
  defaultInstanceId?: string
  basePath: string
  instancesPath: string
  onPick: (instanceId: string, mode: SplitMode) => void
  onClose: () => void
}

export function NewSessionMenu({ instances, harnesses, defaultInstanceId, basePath, instancesPath, onPick, onClose }: NewSessionMenuProps) {
  const [mode, setMode] = useState<SplitMode>('replace')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const harnessMap = useMemo(() => {
    const m = new Map<string, HarnessInfo>()
    for (const h of harnesses) m.set(h.name, h)
    return m
  }, [harnesses])

  const groups = useMemo(() => {
    const groupMap = new Map<string, BridgeInstance[]>()
    for (const inst of instances) {
      if (!inst.enabled) continue
      const list = groupMap.get(inst.harness_type) || []
      list.push(inst)
      groupMap.set(inst.harness_type, list)
    }
    const order = harnesses.map(h => h.name)
    return Array.from(groupMap.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [instances, harnesses])

  return (
    <div ref={menuRef} className="bc-new-session-menu" role="menu">
      <div className="bc-new-session-mode" role="radiogroup" aria-label="Open in">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'replace'}
          className={`bc-new-session-mode-btn ${mode === 'replace' ? 'bc-new-session-mode-btn-active' : ''}`}
          title="Replace the focused workspace"
          onClick={() => setMode('replace')}
        >Replace current</button>
        <span className="bc-new-session-mode-split">
          <span className="bc-new-session-mode-label" title={SPLIT_MODE_LABEL[mode]}>
            {mode === 'replace' ? 'Split…' : SPLIT_MODE_LABEL[mode]}
          </span>
          <SplitButtons
            onSplit={setMode}
            active={mode === 'replace' ? null : mode}
            size="sm"
            autoTitle="Open in a new split (auto direction)"
            chooseTitle="Choose split direction"
          />
        </span>
      </div>
      {groups.length === 0 ? (
        <div className="bc-new-session-empty">
          No instances configured. <Link to={instancesPath}>Add an instance</Link>.
        </div>
      ) : groups.map(([harnessType, group]) => {
        const info = harnessMap.get(harnessType)
        const available = info?.available ?? false
        return (
          <div key={harnessType} className="bc-new-session-group">
            <div className="bc-new-session-group-label">
              {info?.image
                ? <img className="bc-new-session-group-img" src={`${basePath}${info.image}`} alt="" />
                : <span>{info?.emoji || ''}</span>}
              <span>{info?.label || harnessType}</span>
            </div>
            {group.map(inst => (
              <button
                key={inst.id}
                type="button"
                className={`bc-new-session-item ${inst.id === defaultInstanceId ? 'bc-new-session-item-default' : ''}`}
                onClick={() => available && onPick(inst.id, mode)}
                disabled={!available}
                title={available ? `Create new session in ${inst.name}` : `${harnessType} harness unavailable`}
              >
                <span className={`bc-new-session-avail ${available ? 'bc-new-session-avail-on' : 'bc-new-session-avail-off'}`} />
                <span className="bc-new-session-item-name">{inst.name}</span>
                <span className="bc-new-session-item-meta">{inst.machine?.name ?? '—'}</span>
              </button>
            ))}
          </div>
        )
      })}
      <Link to={instancesPath} className="bc-new-session-manage" onClick={onClose}>
        Manage instances…
      </Link>
    </div>
  )
}
