const COLLAPSE_KEY = 'bridge-ui-collapse';
const SIZES_KEY = 'bridge-ui-split-sizes';
const FILTER_KEY = 'bridge-ui-type-filter';
const FOLDER_COLLAPSED_KEY = 'bridge-folder-collapsed';
const WORKSPACES_KEY = 'bridge-ui-workspaces';
export const DEFAULT_PANE_SIZES = { turns: 1, thread: 1, timeline: 1, git: 1 };
export function loadCollapseState() {
    try {
        const s = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}');
        return {
            harnessBar: !!s.harnessBar,
            sessionList: !!s.sessionList,
            turns: !!s.turns,
            thread: !!s.thread,
            timeline: s.timeline === undefined ? true : !!s.timeline,
            git: s.git === undefined ? true : !!s.git,
        };
    }
    catch {
        return { harnessBar: false, sessionList: false, turns: false, thread: false, timeline: true, git: true };
    }
}
export function saveCollapseState(s) {
    try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s));
    }
    catch { /* ignore */ }
}
export function loadPaneSizes() {
    try {
        const raw = JSON.parse(localStorage.getItem(SIZES_KEY) || '{}');
        const pick = (k) => (typeof raw[k] === 'number' && raw[k] > 0 ? raw[k] : 1);
        return { turns: pick('turns'), thread: pick('thread'), timeline: pick('timeline'), git: pick('git') };
    }
    catch {
        return { ...DEFAULT_PANE_SIZES };
    }
}
export function savePaneSizes(s) {
    try {
        localStorage.setItem(SIZES_KEY, JSON.stringify(s));
    }
    catch { /* ignore */ }
}
export function loadHiddenTypes() {
    try {
        const raw = localStorage.getItem(FILTER_KEY);
        if (!raw)
            return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    }
    catch {
        return new Set();
    }
}
export function saveHiddenTypes(s) {
    try {
        localStorage.setItem(FILTER_KEY, JSON.stringify([...s]));
    }
    catch { /* ignore */ }
}
export function loadFolderCollapsed() {
    try {
        return JSON.parse(localStorage.getItem(FOLDER_COLLAPSED_KEY) || '{}');
    }
    catch {
        return {};
    }
}
export function saveFolderCollapsed(next) {
    try {
        localStorage.setItem(FOLDER_COLLAPSED_KEY, JSON.stringify(next));
    }
    catch { /* ignore */ }
}
export function loadWorkspacesState() {
    try {
        const raw = JSON.parse(localStorage.getItem(WORKSPACES_KEY) || 'null');
        if (!raw || !Array.isArray(raw.workspaces))
            return { workspaces: [], focusedWorkspaceId: null };
        const workspaces = raw.workspaces.filter((w) => {
            if (!w || typeof w !== 'object')
                return false;
            const ws = w;
            return typeof ws.id === 'string'
                && (ws.sessionId === null || typeof ws.sessionId === 'string')
                && !!ws.panesHidden && !!ws.paneSizes && !!ws.layout;
        });
        const ids = new Set(workspaces.map(w => w.id));
        const focusedWorkspaceId = typeof raw.focusedWorkspaceId === 'string' && ids.has(raw.focusedWorkspaceId)
            ? raw.focusedWorkspaceId
            : (workspaces[0]?.id ?? null);
        return { workspaces, focusedWorkspaceId };
    }
    catch {
        return { workspaces: [], focusedWorkspaceId: null };
    }
}
export function saveWorkspacesState(s) {
    try {
        localStorage.setItem(WORKSPACES_KEY, JSON.stringify(s));
    }
    catch { /* ignore */ }
}
//# sourceMappingURL=persistence.js.map