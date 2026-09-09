import type { GitRepo } from '../GitPanel';
/**
 * The repositories a session can see, and which one the Git pane is reading.
 *
 * ## Why the pane does not fetch this itself
 *
 * `GitPanel` takes its repo list and selection as props rather than reading them,
 * and that is deliberate on bridge-ui's side: in the original chat the same
 * selection drives both the pane and the repo dropdown in the session header, so a
 * pane that fetched its own list would fight the dropdown. chat has no such
 * dropdown yet, but the shape is the one the pane exports, and owning the state
 * here is what lets a second reader appear later without moving anything.
 *
 * ## What re-reads it
 *
 * The repo LIST is re-read on a session swap, on every new `refetchSignal`, and on
 * an explicit refresh. The pane re-reads the repo's own status and diffs on the
 * same signal — see `GitPanelProps.refetchSignal`.
 *
 * ⚠️ `refetchSignal` is a value that CHANGES when the tree might have, not a
 * meaning. chat passes the session's state string, so the tree is re-read at
 * every turn boundary: an agent that just finished editing files is exactly when
 * the diff on screen has gone stale.
 */
export interface SessionGitRepos {
    repos: GitRepo[];
    selectedRepo: string;
    setSelectedRepo: (path: string) => void;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}
export declare function useGitRepos(sessionId: string | null, refetchSignal: string): SessionGitRepos;
//# sourceMappingURL=useGitRepos.d.ts.map