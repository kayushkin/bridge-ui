import type { CollapseState, PaneSizes } from './types';
export declare const DEFAULT_PANE_SIZES: PaneSizes;
export declare function loadCollapseState(): CollapseState;
export declare function saveCollapseState(s: CollapseState): void;
export declare function loadPaneSizes(): PaneSizes;
export declare function savePaneSizes(s: PaneSizes): void;
export declare function loadHiddenTypes(): Set<string>;
export declare function saveHiddenTypes(s: Set<string>): void;
export declare function loadFolderCollapsed(): Record<string, boolean>;
export declare function saveFolderCollapsed(next: Record<string, boolean>): void;
//# sourceMappingURL=persistence.d.ts.map