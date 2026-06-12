import type { CollapseState, PaneSizes, WorkspaceLayoutNode, WorkspaceState } from './types';
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
    layout: WorkspaceLayoutNode | null;
}
export declare function loadWorkspacesState(): PersistedWorkspaces;
export declare function saveWorkspacesState(s: PersistedWorkspaces): void;
export declare function loadExcludedHarnesses(): Set<string>;
export declare function saveExcludedHarnesses(s: Set<string>): void;
export declare function loadExcludedMachines(): Set<string>;
export declare function saveExcludedMachines(s: Set<string>): void;
export declare const loadExcludedTypes: () => Set<string>;
export declare const saveExcludedTypes: (s: Set<string>) => void;
export declare const loadExcludedPurposes: () => Set<string>;
export declare const saveExcludedPurposes: (s: Set<string>) => void;
export declare const loadExcludedModes: () => Set<string>;
export declare const saveExcludedModes: (s: Set<string>) => void;
export declare function loadDraft(sessionId: string): string;
export declare function saveDraft(sessionId: string, text: string): void;
export declare function clearDraft(sessionId: string): void;
//# sourceMappingURL=persistence.d.ts.map