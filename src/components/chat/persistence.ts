import type { CollapseState, PaneSizes, PaneKey } from './types'

const COLLAPSE_KEY = 'bridge-ui-collapse'
const SIZES_KEY = 'bridge-ui-split-sizes'
const FILTER_KEY = 'bridge-ui-type-filter'
const FOLDER_COLLAPSED_KEY = 'bridge-folder-collapsed'

export const DEFAULT_PANE_SIZES: PaneSizes = { turns: 1, thread: 1, timeline: 1, git: 1 }

export function loadCollapseState(): CollapseState {
  try {
    const s = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')
    return {
      harnessBar: !!s.harnessBar,
      sessionList: !!s.sessionList,
      turns: !!s.turns,
      thread: !!s.thread,
      timeline: s.timeline === undefined ? true : !!s.timeline,
      git: s.git === undefined ? true : !!s.git,
    }
  } catch { return { harnessBar: false, sessionList: false, turns: false, thread: false, timeline: true, git: true } }
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
