import type { WorkspaceLayoutNode } from './types'

export function findLeafPath(node: WorkspaceLayoutNode | null, id: string): number[] | null {
  if (!node) return null
  if (node.kind === 'leaf') return node.workspaceId === id ? [] : null
  for (let i = 0; i < node.children.length; i++) {
    const sub = findLeafPath(node.children[i], id)
    if (sub) return [i, ...sub]
  }
  return null
}

export function* iterateLeafIds(node: WorkspaceLayoutNode | null): Generator<string> {
  if (!node) return
  if (node.kind === 'leaf') { yield node.workspaceId; return }
  for (const c of node.children) yield* iterateLeafIds(c)
}

export function firstLeafId(node: WorkspaceLayoutNode | null): string | null {
  for (const id of iterateLeafIds(node)) return id
  return null
}

export function splitLeaf(
  tree: WorkspaceLayoutNode | null,
  targetId: string,
  newWorkspaceId: string,
  direction: 'h' | 'v',
  position: 'before' | 'after' = 'after',
): WorkspaceLayoutNode {
  const newLeaf: WorkspaceLayoutNode = { kind: 'leaf', workspaceId: newWorkspaceId }

  // No tree yet, or target not present: tree becomes a single new leaf so the
  // caller still gets a working layout (caller can spawn standalone instead).
  if (!tree) return newLeaf
  const path = findLeafPath(tree, targetId)
  if (!path) return tree

  const orderedChildren = (existing: WorkspaceLayoutNode): WorkspaceLayoutNode[] =>
    position === 'before' ? [newLeaf, existing] : [existing, newLeaf]

  // Splitting the root leaf: wrap it in a split with the new sibling.
  if (path.length === 0) {
    return { kind: 'split', direction, children: orderedChildren(tree), sizes: [1, 1] }
  }

  // Walk to the parent split, then either insert as a sibling (if direction
  // matches) or wrap the target leaf in a sub-split.
  return mutateAtPath(tree, path.slice(0, -1), parent => {
    if (parent.kind !== 'split') return parent
    const idx = path[path.length - 1]
    const insertIdx = position === 'before' ? idx : idx + 1
    if (parent.direction === direction) {
      const children = parent.children.slice()
      const sizes = parent.sizes.slice()
      children.splice(insertIdx, 0, newLeaf)
      sizes.splice(insertIdx, 0, 1)
      return { ...parent, children, sizes }
    }
    const target = parent.children[idx]
    const wrapped: WorkspaceLayoutNode = {
      kind: 'split',
      direction,
      children: orderedChildren(target),
      sizes: [1, 1],
    }
    const children = parent.children.slice()
    children[idx] = wrapped
    return { ...parent, children }
  })
}

export function removeLeaf(
  tree: WorkspaceLayoutNode | null,
  targetId: string,
): WorkspaceLayoutNode | null {
  if (!tree) return null
  if (tree.kind === 'leaf') return tree.workspaceId === targetId ? null : tree
  const path = findLeafPath(tree, targetId)
  if (!path || path.length === 0) return tree
  return mutateAtPath(tree, path.slice(0, -1), parent => {
    if (parent.kind !== 'split') return parent
    const idx = path[path.length - 1]
    const children = parent.children.slice()
    const sizes = parent.sizes.slice()
    children.splice(idx, 1)
    sizes.splice(idx, 1)
    if (children.length === 1) return children[0]
    return { ...parent, children, sizes }
  })
}

function mutateAtPath(
  node: WorkspaceLayoutNode,
  path: number[],
  fn: (n: WorkspaceLayoutNode) => WorkspaceLayoutNode,
): WorkspaceLayoutNode {
  if (path.length === 0) return fn(node)
  if (node.kind !== 'split') return node
  const [head, ...rest] = path
  const child = node.children[head]
  if (!child) return node
  const next = mutateAtPath(child, rest, fn)
  if (next === child) return node
  // Collapsing: if the mutated child returned a leaf (single-child collapse
  // higher up), still place it back where the split was.
  const children = node.children.slice()
  children[head] = next
  return { ...node, children }
}

export function isLayoutValid(node: WorkspaceLayoutNode | null, knownIds: Set<string>): boolean {
  if (!node) return true
  if (node.kind === 'leaf') return knownIds.has(node.workspaceId)
  if (node.children.length < 2) return false
  if (node.sizes.length !== node.children.length) return false
  return node.children.every(c => isLayoutValid(c, knownIds))
}

export function buildFlatLayout(workspaceIds: string[]): WorkspaceLayoutNode | null {
  if (workspaceIds.length === 0) return null
  if (workspaceIds.length === 1) return { kind: 'leaf', workspaceId: workspaceIds[0] }
  return {
    kind: 'split',
    direction: 'h',
    children: workspaceIds.map(id => ({ kind: 'leaf', workspaceId: id })),
    sizes: workspaceIds.map(() => 1),
  }
}
