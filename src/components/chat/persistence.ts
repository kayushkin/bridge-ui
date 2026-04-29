import type { CollapseState, PaneSizes, PaneKey, WorkspaceLayoutNode, WorkspaceState } from './types'
import { buildFlatLayout, isLayoutValid } from './workspaceTree'

const COLLAPSE_KEY = 'bridge-ui-collapse'
const SIZES_KEY = 'bridge-ui-split-sizes'
const FILTER_KEY = 'bridge-ui-type-filter'
const FOLDER_COLLAPSED_KEY = 'bridge-folder-collapsed'
const WORKSPACES_KEY = 'bridge-ui-workspaces'
const HARNESS_FILTER_KEY = 'bridge-ui-harness-filter'
const DRAFTS_KEY = 'bridge-ui-drafts'

export const DEFAULT_PANE_SIZES: PaneSizes = { turns: 1, thread: 1, timeline: 1, git: 1 }

export function loadCollapseState(): CollapseState {
  try {
    const s = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')
    return {
      sessionList: !!s.sessionList,
      turns: !!s.turns,
      thread: !!s.thread,
      timeline: s.timeline === undefined ? true : !!s.timeline,
      git: s.git === undefined ? true : !!s.git,
    }
  } catch { return { sessionList: false, turns: false, thread: false, timeline: true, git: true } }
}

export function saveCollapseState(s: CollapseState) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export function loadPaneSizes(): PaneSizes {
  try {
    const raw = JSON.parse(localStorage.getItem(SIZES_KEY) || '{}')
    const pick = (k: PaneKey) => (typeof raw[k] === 'number' && raw[k] > 0 ? raw[k] : 1)
    return { turns: pick('turns'), thread: pick('thread'), timeline: pick('timeline'), git: pick('git') }
  } catch { return { ...DEFAULT_PANE_SIZES } }
}

export function savePaneSizes(s: PaneSizes) {
  try { localStorage.setItem(SIZES_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export function loadHiddenTypes(): Set<string> {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch { return new Set() }
}

export function saveHiddenTypes(s: Set<string>) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
}

export function loadFolderCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(FOLDER_COLLAPSED_KEY) || '{}') } catch { return {} }
}

export function saveFolderCollapsed(next: Record<string, boolean>) {
  try { localStorage.setItem(FOLDER_COLLAPSED_KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

export interface PersistedWorkspaces {
  workspaces: WorkspaceState[]
  focusedWorkspaceId: string | null
  layout: WorkspaceLayoutNode | null
}

function parseLayoutNode(raw: unknown): WorkspaceLayoutNode | null {
  if (!raw || typeof raw !== 'object') return null
  const n = raw as Record<string, unknown>
  if (n.kind === 'leaf') {
    if (typeof n.workspaceId !== 'string') return null
    return { kind: 'leaf', workspaceId: n.workspaceId }
  }
  if (n.kind === 'split') {
    if (n.direction !== 'h' && n.direction !== 'v') return null
    if (!Array.isArray(n.children)) return null
    const children = n.children.map(parseLayoutNode).filter((c): c is WorkspaceLayoutNode => !!c)
    if (children.length < 2) return null
    const sizesRaw = Array.isArray(n.sizes) ? n.sizes : []
    const sizes = children.map((_, i) => {
      const v = sizesRaw[i]
      return typeof v === 'number' && v > 0 ? v : 1
    })
    return { kind: 'split', direction: n.direction, children, sizes }
  }
  return null
}

export function loadWorkspacesState(): PersistedWorkspaces {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKSPACES_KEY) || 'null')
    if (!raw || !Array.isArray(raw.workspaces)) return { workspaces: [], focusedWorkspaceId: null, layout: null }
    const workspaces: WorkspaceState[] = raw.workspaces.filter((w: unknown) => {
      if (!w || typeof w !== 'object') return false
      const ws = w as Partial<WorkspaceState>
      return typeof ws.id === 'string'
        && (ws.sessionId === null || typeof ws.sessionId === 'string')
        && !!ws.panesHidden && !!ws.paneSizes && !!ws.layout
    })
    const ids = new Set(workspaces.map(w => w.id))
    const focusedWorkspaceId = typeof raw.focusedWorkspaceId === 'string' && ids.has(raw.focusedWorkspaceId)
      ? raw.focusedWorkspaceId
      : (workspaces[0]?.id ?? null)
    let layout: WorkspaceLayoutNode | null = parseLayoutNode(raw.layout)
    if (!layout || !isLayoutValid(layout, ids)) {
      layout = buildFlatLayout(workspaces.map(w => w.id))
    }
    return { workspaces, focusedWorkspaceId, layout }
  } catch { return { workspaces: [], focusedWorkspaceId: null, layout: null } }
}

export function saveWorkspacesState(s: PersistedWorkspaces) {
  try { localStorage.setItem(WORKSPACES_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

// Excluded harness names for the sidebar filter. Default = empty set (show all).
export function loadExcludedHarnesses(): Set<string> {
  try {
    const raw = localStorage.getItem(HARNESS_FILTER_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch { return new Set() }
}

export function saveExcludedHarnesses(s: Set<string>) {
  try { localStorage.setItem(HARNESS_FILTER_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
}

// Excluded machine IDs for the sidebar filter — sibling to the instance
// blacklist above. Stored under its own localStorage key so the two
// filters can be cleared/reset independently.
const MACHINE_FILTER_KEY = 'bridge.machineFilter.excluded'

export function loadExcludedMachines(): Set<string> {
  try {
    const raw = localStorage.getItem(MACHINE_FILTER_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch { return new Set() }
}

export function saveExcludedMachines(s: Set<string>) {
  try { localStorage.setItem(MACHINE_FILTER_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
}

// Composer drafts keyed by session id. Persisted as a single object so a
// session's in-progress text survives layout changes, pane swaps, and reloads.
function readDrafts(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}')
    if (!raw || typeof raw !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k === 'string' && typeof v === 'string') out[k] = v
    }
    return out
  } catch { return {} }
}

function writeDrafts(drafts: Record<string, string>) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)) } catch { /* ignore */ }
}

export function loadDraft(sessionId: string): string {
  if (!sessionId) return ''
  return readDrafts()[sessionId] ?? ''
}

export function saveDraft(sessionId: string, text: string) {
  if (!sessionId) return
  const drafts = readDrafts()
  if (text) drafts[sessionId] = text
  else delete drafts[sessionId]
  writeDrafts(drafts)
}

export function clearDraft(sessionId: string) {
  if (!sessionId) return
  const drafts = readDrafts()
  if (sessionId in drafts) {
    delete drafts[sessionId]
    writeDrafts(drafts)
  }
}
