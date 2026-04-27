import { Fragment, useCallback, useRef, useState } from 'react'
import type { WorkspaceLayoutNode } from './types'

interface WorkspaceLayoutProps {
  node: WorkspaceLayoutNode
  renderLeaf: (workspaceId: string) => React.ReactNode
  onResize: (path: number[], sizes: number[]) => void
}

export function WorkspaceLayout({ node, renderLeaf, onResize }: WorkspaceLayoutProps) {
  return <LayoutNode node={node} path={[]} renderLeaf={renderLeaf} onResize={onResize} />
}

interface LayoutNodeProps extends WorkspaceLayoutProps {
  path: number[]
}

function LayoutNode({ node, path, renderLeaf, onResize }: LayoutNodeProps) {
  if (node.kind === 'leaf') {
    return <>{renderLeaf(node.workspaceId)}</>
  }
  return <SplitNode node={node} path={path} renderLeaf={renderLeaf} onResize={onResize} />
}

function SplitNode({
  node,
  path,
  renderLeaf,
  onResize,
}: LayoutNodeProps & { node: Extract<WorkspaceLayoutNode, { kind: 'split' }> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const className = `bc-workspace-split bc-workspace-split-${node.direction}`
  return (
    <div ref={containerRef} className={className}>
      {node.children.map((child, i) => {
        const flex = node.sizes[i] ?? 1
        return (
          <Fragment key={`${i}`}>
            {i > 0 && (
              <SplitResizer
                direction={node.direction}
                containerRef={containerRef}
                index={i}
                sizes={node.sizes}
                onCommit={(sizes) => onResize(path, sizes)}
              />
            )}
            <div className="bc-workspace-split-child" style={{ flex: `${flex} 1 0` }}>
              <LayoutNode
                node={child}
                path={[...path, i]}
                renderLeaf={renderLeaf}
                onResize={onResize}
              />
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

interface SplitResizerProps {
  direction: 'h' | 'v'
  containerRef: React.RefObject<HTMLDivElement | null>
  index: number
  sizes: number[]
  onCommit: (sizes: number[]) => void
}

function SplitResizer({ direction, containerRef, index, sizes, onCommit }: SplitResizerProps) {
  const [dragging, setDragging] = useState(false)
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const children = Array.from(container.children).filter(el =>
      (el as HTMLElement).classList.contains('bc-workspace-split-child')
    ) as HTMLElement[]
    const leftEl = children[index - 1]
    const rightEl = children[index]
    if (!leftEl || !rightEl) return

    const isHorizontal = direction === 'h'
    const startPos = isHorizontal ? e.clientX : e.clientY
    const leftRect = leftEl.getBoundingClientRect()
    const rightRect = rightEl.getBoundingClientRect()
    const pairExtent = isHorizontal
      ? leftRect.width + rightRect.width
      : leftRect.height + rightRect.height
    const startLeft = sizes[index - 1] ?? 1
    const startRight = sizes[index] ?? 1
    const totalGrow = startLeft + startRight
    if (totalGrow <= 0 || pairExtent <= 0) return
    const pixelsPerGrow = pairExtent / totalGrow
    const MIN_PX = 180
    const minGrow = Math.min(MIN_PX / pixelsPerGrow, totalGrow / 2)

    setDragging(true)
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      const delta = (isHorizontal ? ev.clientX : ev.clientY) - startPos
      const growDelta = delta / pixelsPerGrow
      let newLeft = startLeft + growDelta
      let newRight = startRight - growDelta
      if (newLeft < minGrow) { newLeft = minGrow; newRight = totalGrow - minGrow }
      if (newRight < minGrow) { newRight = minGrow; newLeft = totalGrow - minGrow }
      const next = sizes.slice()
      next[index - 1] = newLeft
      next[index] = newRight
      onCommit(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [containerRef, direction, index, sizes, onCommit])

  const onDoubleClick = useCallback(() => {
    const next = sizes.slice()
    next[index - 1] = 1
    next[index] = 1
    onCommit(next)
  }, [sizes, index, onCommit])

  const isHorizontal = direction === 'h'
  return (
    <div
      className={`bc-workspace-resizer bc-workspace-resizer-${direction}${dragging ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      title="Drag to resize — double-click to reset"
    />
  )
}
