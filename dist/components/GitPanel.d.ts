import type { SessionUIState } from '../types';
import type { GitRepo } from './chat/WorkspaceContext';
export interface GitPanelProps {
    sessionId: string;
    uiState: SessionUIState;
    gitRepos: GitRepo[];
    selectedRepo: string;
    setSelectedRepo: (path: string) => void;
    gitReposLoading: boolean;
    gitReposError: string | null;
    refreshGitRepos: () => void;
    onToggleCollapse: () => void;
    style?: React.CSSProperties;
    paneKey?: string;
}
export declare function GitPanel({ sessionId, uiState, gitRepos: repos, selectedRepo, setSelectedRepo, gitReposLoading: loadingRepos, gitReposError: reposError, refreshGitRepos, onToggleCollapse, style, paneKey, }: GitPanelProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=GitPanel.d.ts.map