import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../../context';
export function useGitRepos(sessionId, refetchSignal) {
    const { fetch: bridgeFetch, basePath } = useBridgeConfig();
    const [repos, setRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const refresh = useCallback(() => setRefreshTick(tick => tick + 1), []);
    useEffect(() => {
        if (!sessionId) {
            // Cleared rather than left standing. A stale repo list under a session that
            // does not own it is worse than an empty pane: the paths look plausible and
            // the diff below them belongs to somebody else's work.
            setRepos([]);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        bridgeFetch(`${basePath}/sessions/${sessionId}/git/repos`)
            .then(async (response) => {
            if (!response.ok)
                throw new Error(`${response.status} ${await response.text()}`);
            return (await response.json());
        })
            .then(body => {
            if (!cancelled)
                setRepos(body.repos ?? []);
        })
            .catch((err) => {
            if (cancelled)
                return;
            // Stated, not swallowed. `GitPanel` renders this string, so a session on a
            // machine that has gone away says so instead of showing an empty repo
            // dropdown that looks like a session with no repositories.
            setError(`repos: ${err instanceof Error ? err.message : String(err)}`);
            setRepos([]);
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [sessionId, refetchSignal, refreshTick, bridgeFetch, basePath]);
    useEffect(() => {
        if (repos.length === 0) {
            setSelectedRepo('');
            return;
        }
        // Re-pick when the current selection is not in the list — a session swap, or a
        // repo that has gone. Falling through to the first entry rather than keeping a
        // path this session cannot read is what stops the pane asking for a repo the
        // server will 404, over and over, on every signal.
        if (!selectedRepo || !repos.some(repo => repo.path === selectedRepo)) {
            setSelectedRepo(repos[0].path);
        }
    }, [repos, selectedRepo]);
    return { repos, selectedRepo, setSelectedRepo, loading, error, refresh };
}
//# sourceMappingURL=useGitRepos.js.map