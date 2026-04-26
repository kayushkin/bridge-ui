import type { CollapseState, PaneSizes, WorkspaceState } from './types';
export declare const DEFAULT_PANE_SIZES: PaneSizes;
export declare function loadCollapseState(): CollapseState;
export declare function saveCollapseState(s: CollapseState): void;
export declare function loadPaneSizes(): PaneSizes;
export declare function savePaneSizes(s: PaneSizes): void;
export declare function loadHiddenTypes(): Set<string>;
export declare function saveHiddenTypes(s: Set<string>): void;
export declare function loadFolderCollapsed(): Record<string, boolean>;
export declare function saveFolderCollapsed(next: Record<string, boolean>): void;
export interface PersistedWorkspaces {
    workspaces: WorkspaceState[];
    focusedWorkspaceId: string | null;
}
export declare function loadWorkspacesState(): PersistedWorkspaces;
export declare function saveWorkspacesState(s: PersistedWorkspaces): void;
export declare function loadExcludedInstances(): Set<string>;
export declare function saveExcludedInstances(s: Set<string>): void;
//# sourceMappingURL=persistence.d.ts.map