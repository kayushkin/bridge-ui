import type { ActivityKind, LogRow, SessionUIState } from '../../types';
import type { ChatSession, PaneKey, PaneSizes, PanesHidden } from './types';
export interface GitRepo {
    path: string;
    name: string;
}
export interface WorkspaceValue {
    chat: ChatSession | null;
    rows: LogRow[];
    loading: boolean;
    uiState: SessionUIState;
    activity: ActivityKind;
    error: string | null;
    panesHidden: PanesHidden;
    paneSizes: PaneSizes;
    togglePane: (key: PaneKey) => void;
    setPaneSizes: React.Dispatch<React.SetStateAction<PaneSizes>>;
    gitRepos: GitRepo[];
    selectedRepo: string;
    setSelectedRepo: (path: string) => void;
    gitReposLoading: boolean;
    gitReposError: string | null;
    refreshGitRepos: () => void;
}
export declare const WorkspaceContext: import("react").Context<WorkspaceValue | null>;
export declare function useWorkspace(): WorkspaceValue;
export declare function WorkspaceProvider({ value, children }: {
    value: WorkspaceValue;
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=WorkspaceContext.d.ts.map