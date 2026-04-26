import type { ActivityKind, LogRow, SessionUIState } from '../../types';
import type { ChatSession, CollapseState, PaneKey, PaneSizes } from './types';
export interface WorkspaceValue {
    chat: ChatSession | null;
    rows: LogRow[];
    loading: boolean;
    uiState: SessionUIState;
    activity: ActivityKind;
    error: string | null;
    collapseState: CollapseState;
    paneSizes: PaneSizes;
    togglePane: (key: PaneKey) => void;
    setPaneSizes: React.Dispatch<React.SetStateAction<PaneSizes>>;
}
export declare const WorkspaceContext: import("react").Context<WorkspaceValue | null>;
export declare function useWorkspace(): WorkspaceValue;
export declare function WorkspaceProvider({ value, children }: {
    value: WorkspaceValue;
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=WorkspaceContext.d.ts.map