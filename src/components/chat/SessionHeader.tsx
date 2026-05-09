import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { HarnessInfo, LogRow, Machine, ManagedSession } from '../../types'
import { formatCost, formatTokens } from '../../utils'
import { EditableName } from './EditableName'
import { PaneToggles } from './PaneToggles'
import { StatusDot } from './StatusDot'
import type { ChatSession, PanesHidden } from './types'
import type { GitRepo } from './WorkspaceContext'

export function SessionHeader({ chat, session, harnessInfo, machine, machineReachable, basePath, uiState, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onToggleKanban, onCloseWorkspace, gitRepos, selectedRepo, onSelectRepo }: {
  chat: ChatSession | null
  /** Full session row from the bridge — drives the details dropdown
   * (source, folder, instance, mode, IDs, timestamps). Undefined when
   * no session is active. */
  session?: ManagedSession | null
  /** Server-registered HarnessInfo for chat.harness — canonical source for
   * label/emoji/image. Constants are fallbacks for harnesses the server
   * hasn't registered. */
  harnessInfo?: HarnessInfo
  /** The machine the active session's instance is bound to. Drives the
   * machine chip in the header. Undefined when no session is active. */
  machine?: Machine
  /** Latest reachability for the active instance's machine (polled
   * upstream). null = unknown / no active session. */
  machineReachable?: boolean | null
  /** Used to resolve harnessInfo.image (a server-relative path). */
  basePath: string
  uiState: string
  rows: LogRow[]
  onRename: (name: string) => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  panesHidden: PanesHidden
  onToggleTurns: () => void
  onToggleThread: () => void
  onToggleTimeline: () => void
  onToggleGit: () => void
  onToggleKanban: () => void
  onCloseWorkspace?: () => void
  gitRepos: GitRepo[]
  selectedRepo: string
  onSelectRepo: (path: string) => void
}) {
  const completed = chat ? rows.filter(r => r.actor === 'assistant' && r.done && r.meta) : []
  const last = completed[completed.length - 1]
  const meta = last?.meta
  let totalCost = 0
  for (const r of completed) totalCost += r.meta?.cost?.total_usd ?? 0

  const contextTokens = meta?.usage?.context_tokens ?? 0
  const contextLimit = meta?.usage?.context_limit ?? 0
  const contextPct = contextTokens && contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0
  const contextTone = contextPct >= 90 ? 'crit' : contextPct >= 70 ? 'warn' : ''

  const dotState = chat && uiState !== 'empty' ? uiState : 'placeholder'
  const dotTitle = chat && uiState !== 'empty'
    ? uiState.charAt(0).toUpperCase() + uiState.slice(1)
    : 'No session'

  // All harness chrome (label / emoji / image / tint) comes from server-side
  // HarnessInfo. No client-side fallback maps — if a field is missing, fix
  // the server registration (llm-bridge-server harnessMetadata).
  const harness = chat?.harness ?? ''
  const harnessLabel = harnessInfo?.label || harness
  const harnessEmoji = harnessInfo?.emoji || ''
  const harnessImage = harnessInfo?.image
  const headerStyle: CSSProperties | undefined = harnessInfo?.tint
    ? ({ ['--bc-harness']: harnessInfo.tint } as CSSProperties)
    : undefined

  const currentRepo = gitRepos.find(r => r.path === selectedRepo) ?? gitRepos[0]
  const repoCount = gitRepos.length

  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!detailsOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!detailsRef.current) return
      if (!detailsRef.current.contains(e.target as Node)) setDetailsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailsOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [detailsOpen])

  const sourceLabel = session?.purpose || 'chat'

  return (
    <div className="bc-header" style={headerStyle} data-harness={harness || undefined}>
      <div className="bc-header-row">
        <div className="bc-nav-arrows">
          <button className="bc-nav-arrow" onClick={onPrev} disabled={!hasPrev} title="Previous session" aria-label="Previous session">‹</button>
          <button className="bc-nav-arrow" onClick={onNext} disabled={!hasNext} title="Next session" aria-label="Next session">›</button>
        </div>
        <StatusDot state={dotState} title={dotTitle} />
        {harness && (
          <span className="bc-harness-chip" title={harnessLabel} aria-label={harnessLabel}>
            {harnessImage
              ? <img className="bc-harness-chip-img" src={`${basePath}${harnessImage}`} alt="" />
              : harnessEmoji
                ? <span className="bc-harness-chip-emoji" aria-hidden>{harnessEmoji}</span>
                : <span className="bc-harness-chip-label">{harnessLabel}</span>}
          </span>
        )}
        {machine && (
          <span
            className="bc-machine-chip"
            title={[
              `${machine.name}${machine.hostname ? ` (${machine.hostname})` : ''}`,
              `transport: ${machine.transport}`,
              machineReachable === null ? 'reachability unknown' :
                machineReachable ? 'reachable' : 'unreachable',
            ].join('\n')}
          >
            <span className="bc-machine-chip-emoji" aria-hidden>{machine.emoji || '🖥'}</span>
            <span className="bc-machine-chip-label">{machine.name}</span>
            <span
              className={
                'bc-machine-chip-dot ' +
                (machineReachable === null
                  ? 'bc-machine-chip-dot-unknown'
                  : machineReachable
                    ? 'bc-machine-chip-dot-ok'
                    : 'bc-machine-chip-dot-fail')
              }
              aria-hidden
            />
          </span>
        )}
        {session && (
          <div className="bc-details-wrap" ref={detailsRef}>
            <button
              type="button"
              className={`bc-source-chip${detailsOpen ? ' bc-source-chip-open' : ''}`}
              onClick={() => setDetailsOpen(o => !o)}
              data-source={session.purpose || 'chat'}
              title={`source: ${sourceLabel}\nclick for full session details`}
              aria-expanded={detailsOpen}
              aria-label="Session details"
            >
              <span className="bc-source-chip-label">{sourceLabel}</span>
              <span className="bc-source-chip-caret" aria-hidden>▾</span>
            </button>
            {detailsOpen && <SessionDetailsPanel session={session} />}
          </div>
        )}
        {chat
          ? <EditableName value={chat.displayName} onSave={onRename} className="bc-session-name" />
          : <span className="bc-session-name bc-session-name-empty">—</span>}
        {totalCost > 0 && (
          <span className="bc-cost" title={contextTokens && contextLimit ? `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)} context tokens (${contextPct}%)` : undefined}>
            {formatCost(totalCost)}
          </span>
        )}
        {repoCount > 0 && currentRepo && (
          <label
            className="bc-repo-chip"
            title={`${currentRepo.path}${repoCount > 1 ? ` — ${repoCount} repos discovered` : ''}`}
          >
            <span className="bc-repo-chip-icon" aria-hidden>◆</span>
            <span className="bc-repo-chip-name">{currentRepo.name}</span>
            {repoCount > 1 && <span className="bc-repo-chip-count" aria-hidden>+{repoCount - 1}</span>}
            <select
              className="bc-repo-chip-select"
              value={selectedRepo}
              onChange={e => onSelectRepo(e.target.value)}
              aria-label="Switch repository"
            >
              {gitRepos.map(r => (
                <option key={r.path} value={r.path}>{r.name}</option>
              ))}
            </select>
            <span className="bc-repo-chip-caret" aria-hidden>▾</span>
          </label>
        )}
        <div className="bc-header-right">
          <PaneToggles
            panesHidden={panesHidden}
            onToggleTurns={onToggleTurns}
            onToggleThread={onToggleThread}
            onToggleTimeline={onToggleTimeline}
            onToggleGit={onToggleGit}
            onToggleKanban={onToggleKanban}
          />
          {onCloseWorkspace && (
            <button
              className="bc-workspace-close"
              onClick={onCloseWorkspace}
              title="Close workspace"
              aria-label="Close workspace"
            >×</button>
          )}
        </div>
      </div>
      {contextTokens > 0 && contextLimit > 0 && (
        <div
          className={`bc-header-context ${contextTone ? `bc-header-context-${contextTone}` : ''}`}
          style={{ width: `${contextPct}%` }}
        />
      )}
    </div>
  )
}

function SessionDetailsPanel({ session }: { session: ManagedSession }) {
  const fmt = (v: string | undefined | null) => v && v.length ? v : '—'
  const fmtDate = (v: string | undefined | null) => {
    if (!v) return '—'
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString()
  }
  const rows: Array<[string, string, boolean?]> = [
    ['type', fmt(session.type)],
    ['purpose', fmt(session.purpose)],
    ['origin', fmt(session.origin)],
    ['folder', fmt(session.folder_name)],
    ['state', fmt(session.state)],
    ['mode', session.mode || 'events'],
    ['harness', fmt(session.harness)],
    ['agent', fmt(session.agent_id)],
    ['instance', fmt(session.instance_id), true],
    ['session id', fmt(session.session_id), true],
    ['harness session', fmt(session.harness_session_id), true],
    ['parent', fmt(session.parent_id), true],
    ['spawner', fmt(session.spawner_id), true],
    ['pid', session.pid ? String(session.pid) : '—'],
    ['created', fmtDate(session.created_at)],
    ['updated', fmtDate(session.updated_at)],
  ]
  return (
    <div className="bc-details-panel" role="dialog" aria-label="Session details">
      <dl className="bc-details-list">
        {rows.map(([k, v, mono]) => (
          <div className="bc-details-row" key={k}>
            <dt>{k}</dt>
            <dd className={mono ? 'bc-details-mono' : undefined} title={v}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
