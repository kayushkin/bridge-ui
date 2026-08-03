import { Fragment, useRef } from 'react'
import { SplitDragHandle } from './SplitDragHandle'
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

  // The children of this split, in DOM order. The container also holds the
  // resizer elements, so a class filter is what separates panes from handles.
  const paneElements = (): HTMLElement[] => {
    const container = containerRef.current
    if (!container) return []
    return Array.from(container.children).filter(element =>
      (element as HTMLElement).classList.contains('bc-workspace-split-child')
    ) as HTMLElement[]
  }

  return (
    <div ref={containerRef} className={className}>
      {node.children.map((child, i) => {
        const flex = node.sizes[i] ?? 1
        return (
          <Fragment key={`${i}`}>
            {i > 0 && (
              <SplitDragHandle
                axis={node.direction === 'h' ? 'horizontal' : 'vertical'}
                className={`bc-workspace-resizer bc-workspace-resizer-${node.direction}`}
                resolveDraggedPair={() => {
                  const panes = paneElements()
                  const elementBefore = panes[i - 1]
                  const elementAfter = panes[i]
                  if (!elementBefore || !elementAfter) return null
                  return {
                    elementBefore,
                    elementAfter,
                    growUnitsBefore: node.sizes[i - 1] ?? 1,
                    growUnitsAfter: node.sizes[i] ?? 1,
                  }
                }}
                commitGrowUnits={({ growUnitsBefore, growUnitsAfter }) => {
                  const sizes = node.sizes.slice()
                  sizes[i - 1] = growUnitsBefore
                  sizes[i] = growUnitsAfter
                  onResize(path, sizes)
                }}
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
