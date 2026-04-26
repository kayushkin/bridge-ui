import { useRef } from 'react'
import { GitPanel } from '../GitPanel'
import { SplitResizer } from './SplitResizer'
import { Thread } from './Thread'
import { Timeline } from './Timeline'
import { TurnsView } from './TurnsView'
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
          onToggleCollapse={() => ws.togglePane('turns')}
          style={style}
          paneKey="turns"
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
            uiState={ws.uiState}
            activity={ws.activity}
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
  }
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
          <SplitResizer
            key={`resizer-${leftKey}-${rightKey}`}
            leftKey={leftKey}
            rightKey={rightKey}
            containerRef={containerRef}
            setSizes={ws.setPaneSizes}
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

  if (!hasVisibleLeaf(tree, hidden)) {
    return (
      <div className="bc-chat-split">
        <div className="bc-split-empty">
          <div className="bc-split-empty-hint">
            All panes hidden. Use the toggles above to show Turns, Thread, Timeline, or Git.
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
