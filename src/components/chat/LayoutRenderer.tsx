import { useEffect, useRef, useState } from 'react'
import { BridgeAttach } from '../BridgeAttach'
import { GitPanel } from '../GitPanel'
import { LinkedKanbanPanel } from './LinkedKanbanPanel'
import { OrchestratorPanel } from './OrchestratorPanel'
import { SplitDragHandle } from './SplitDragHandle'
import { Thread } from './Thread'
import { Timeline } from './Timeline'
import { TurnsView } from './TurnsView'
import { harnessIsWorkingOnTurn } from './utils'
import { useWorkspace } from './WorkspaceContext'
import type { InnerNode, PaneKey, ViewType } from './types'

function hasVisibleLeaf(node: InnerNode, hidden: Set<ViewType>): boolean {
  if (node.kind === 'leaf') return !hidden.has(node.viewType)
  return node.children.some(c => hasVisibleLeaf(c, hidden))
}

function ViewLeaf({ viewType, style }: { viewType: ViewType; style?: React.CSSProperties }) {
  const ws = useWorkspace()
  const sessionId = ws.chat?.sessionId ?? ''
  const agent = ws.chat?.agent ?? ''
  switch (viewType) {
    case 'turns':
      return (
        <TurnsView
          rows={ws.rows}
          agent={agent}
          compacting={ws.compacting}
          harnessWorking={harnessIsWorkingOnTurn(ws.uiState)}
          onToggleCollapse={() => ws.togglePane('turns')}
          style={style}
          paneKey="turns"
          sessionId={sessionId}
        />
      )
    case 'thread':
      return (
        <div className="bc-split-pane bc-split-pane-thread" style={style} data-pane="thread">
          <div
            className="bc-split-pane-header bc-header-clickable"
            onClick={() => ws.togglePane('thread')}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ws.togglePane('thread') } }}
            role="button"
            tabIndex={0}
            title="Hide thread"
            aria-label="Hide thread"
          >
            <span className="bc-split-pane-title">Thread</span>
            <span className="bc-spacer" />
            <span className="bc-split-collapse-btn" aria-hidden="true">×</span>
          </div>
          <Thread
            rows={ws.rows}
            loading={ws.loading}
            error={ws.error}
            agent={agent}
            sessionId={sessionId}
          />
        </div>
      )
    case 'timeline':
      return (
        <Timeline
          rows={ws.rows}
          onToggleCollapse={() => ws.togglePane('timeline')}
          style={style}
          paneKey="timeline"
          sessionId={sessionId}
        />
      )
    case 'git':
      return (
        <GitPanel
          sessionId={sessionId}
          uiState={ws.uiState}
          onToggleCollapse={() => ws.togglePane('git')}
          style={style}
          paneKey="git"
        />
      )
    case 'kanban':
      return (
        <LinkedKanbanPanel
          sessionId={sessionId}
          onToggleCollapse={() => ws.togglePane('kanban')}
          style={style}
          paneKey="kanban"
        />
      )
    case 'orchestrator':
      return (
        <OrchestratorPanel
          onToggleCollapse={() => ws.togglePane('orchestrator')}
          style={style}
        />
      )
    case 'attach':
      return <AttachLeaf style={style} />
  }
}

// AttachLeaf wraps BridgeAttach with the boilerplate pane chrome and pulls
// the session id + attach token off the workspace context (populated by
// Workspace from its own useBridgeSession). Reading useBridgeSession()
// directly here doesn't work — the hook isn't context-backed and a fresh
// call creates an independent state instance with an empty activeSession.
function AttachLeaf({ style }: { style?: React.CSSProperties }) {
  const ws = useWorkspace()
  const sessionId = ws.chat?.sessionId ?? ''
  const token = ws.attachToken ?? ''
  // After a page refresh the in-memory attachTokens map is empty, but
  // the server's hub usually still has a live token. Try to recover it
  // once on mount (and whenever the active session changes) before
  // falling back to the "flip mode to mint" hint. The 'pending' state
  // suppresses the hint during the in-flight fetch so the user doesn't
  // see it flash.
  const [pending, setPending] = useState(false)
  const refresh = ws.refreshAttachToken
  useEffect(() => {
    if (!sessionId || token || !refresh || ws.sessionMode !== 'pty') return
    let cancelled = false
    setPending(true)
    refresh(sessionId).finally(() => { if (!cancelled) setPending(false) })
    return () => { cancelled = true }
  }, [sessionId, token, refresh, ws.sessionMode])
  return (
    <div className="bc-split-pane bc-split-pane-attach" style={style} data-pane="attach">
      <div
        className="bc-split-pane-header bc-header-clickable"
        onClick={() => ws.togglePane('attach')}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ws.togglePane('attach') } }}
        role="button"
        tabIndex={0}
        title="Hide terminal"
        aria-label="Hide terminal"
      >
        <span className="bc-split-pane-title">Terminal</span>
        <span className="bc-spacer" />
        <span className="bc-split-collapse-btn" aria-hidden="true">×</span>
      </div>
      {sessionId && token ? (
        <BridgeAttach sessionId={sessionId} attachToken={token} />
      ) : (
        <div className="bc-attach-empty">
          {!sessionId
            ? 'No active session.'
            : pending
            ? 'Recovering attach token…'
            : 'No live pty hub for this session — flip mode via the toggle to mint one.'}
        </div>
      )}
    </div>
  )
}

function SplitView({ node, hidden }: { node: Extract<InnerNode, { kind: 'split' }>; hidden: Set<ViewType> }) {
  const ws = useWorkspace()
  const containerRef = useRef<HTMLDivElement>(null)
  const visibleChildren = node.children.filter(c => hasVisibleLeaf(c, hidden))
  if (visibleChildren.length === 0) return null

  // Resizers operate on direct PaneKey leaves only. Nested-split resizing
  // arrives in a later phase; for now non-leaf siblings render without a
  // resizable boundary.
  const directLeafKey = (n: InnerNode): PaneKey | null => (n.kind === 'leaf' ? n.viewType : null)

  const styleFor = (n: InnerNode): React.CSSProperties => {
    const k = directLeafKey(n)
    if (k) return { flex: `${ws.paneSizes[k]} 1 0` }
    return { flex: '1 1 0' }
  }

  const className = `bc-chat-split bc-chat-split-${node.direction}`
  const nodes: React.ReactNode[] = []
  visibleChildren.forEach((child, i) => {
    if (i > 0 && node.direction === 'h') {
      const leftKey = directLeafKey(visibleChildren[i - 1])
      const rightKey = directLeafKey(child)
      if (leftKey && rightKey) {
        nodes.push(
          <SplitDragHandle
            key={`resizer-${leftKey}-${rightKey}`}
            axis="horizontal"
            className="bc-split-resizer"
            resolveDraggedPair={() => {
              const container = containerRef.current
              if (!container) return null
              const elementBefore = container.querySelector(`[data-pane="${leftKey}"]`) as HTMLElement | null
              const elementAfter = container.querySelector(`[data-pane="${rightKey}"]`) as HTMLElement | null
              if (!elementBefore || !elementAfter) return null
              return {
                elementBefore,
                elementAfter,
                growUnitsBefore: ws.paneSizes[leftKey],
                growUnitsAfter: ws.paneSizes[rightKey],
              }
            }}
            commitGrowUnits={({ growUnitsBefore, growUnitsAfter }) => {
              ws.setPaneSizes(prev => ({ ...prev, [leftKey]: growUnitsBefore, [rightKey]: growUnitsAfter }))
            }}
          />
        )
      }
    }
    if (child.kind === 'leaf') {
      nodes.push(<ViewLeaf key={`leaf-${child.viewType}`} viewType={child.viewType} style={styleFor(child)} />)
    } else {
      nodes.push(<SplitView key={`split-${i}`} node={child} hidden={hidden} />)
    }
  })

  return <div ref={containerRef} className={className} style={styleFor(node)}>{nodes}</div>
}

export function LayoutRenderer({ tree }: { tree: InnerNode }) {
  const ws = useWorkspace()
  const hidden = new Set<ViewType>()
  if (ws.panesHidden.turns) hidden.add('turns')
  if (ws.panesHidden.thread) hidden.add('thread')
  if (ws.panesHidden.timeline) hidden.add('timeline')
  if (ws.panesHidden.git) hidden.add('git')
  if (ws.panesHidden.kanban) hidden.add('kanban')
  if (ws.panesHidden.orchestrator) hidden.add('orchestrator')
  // The Terminal pane only makes sense for pty sessions. Force-hide it
  // for events sessions regardless of the persisted panesHidden state,
  // so a user who flips between modes doesn't accidentally see an
  // empty/dead terminal box on their events-mode workspaces.
  if (ws.panesHidden.attach || ws.sessionMode !== 'pty') hidden.add('attach')

  if (!hasVisibleLeaf(tree, hidden)) {
    return (
      <div className="bc-chat-split">
        <div className="bc-split-empty">
          <div className="bc-split-empty-hint">
            All panes hidden. Use the toggles above to show Turns, Thread, Timeline, Git, or Kanban.
          </div>
        </div>
      </div>
    )
  }

  if (tree.kind === 'leaf') {
    return <ViewLeaf viewType={tree.viewType} />
  }
  return <SplitView node={tree} hidden={hidden} />
}
