import type { GitRepo } from './chat/WorkspaceContext';
export interface GitPanelProps {
    sessionId: string;
    /** Any value that changes when the working tree might have. The panel
     *  re-reads the repo on every new value and never inspects it.
     *
     *  It was typed `SessionUIState` and named `uiState`, which claimed the panel
     *  cared what the session was doing. It does not — the value appears once, in
     *  a dependency array. The narrow type was also the only thing stopping a host
     *  that tracks session state as a plain string (dashv2, on chat-core) from
     *  mounting this pane at all, for a distinction the panel cannot act on. */
    refetchSignal: string;
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
export declare function GitPanel({ sessionId, refetchSignal, gitRepos: repos, selectedRepo, setSelectedRepo, gitReposLoading: loadingRepos, gitReposError: reposError, refreshGitRepos, onToggleCollapse, style, paneKey, }: GitPanelProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=GitPanel.d.ts.map