import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
const SECTION_LABELS = {
    status: 'Status',
    diff_unstaged: 'Unstaged',
    diff_staged: 'Staged',
    log: 'Log',
};
export function GitPanel({ sessionId, uiState, onToggleCollapse }) {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [repos, setRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState('');
    const [view, setView] = useState(null);
    const [error, setError] = useState(null);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [loadingView, setLoadingView] = useState(false);
    const [openSections, setOpenSections] = useState({
        status: true,
        diff_unstaged: true,
        diff_staged: false,
        log: false,
    });
    // Bumped manually to force a refetch even when nothing else changed.
    const [refreshTick, setRefreshTick] = useState(0);
    const refresh = useCallback(() => setRefreshTick(t => t + 1), []);
    // Refetch repos on session change, on every turn boundary (uiState flips),
    // and on manual refresh.
    useEffect(() => {
        if (!sessionId) {
            setRepos([]);
            setView(null);
            return;
        }
        let cancelled = false;
        setLoadingRepos(true);
        setError(null);
        fetchFn(`${basePath}/sessions/${sessionId}/git/repos`)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(`${r.status} ${await r.text()}`);
            return r.json();
        })
            .then(data => {
            if (cancelled)
                return;
            setRepos(data.repos || []);
        })
            .catch(err => {
            if (cancelled)
                return;
            setError(`repos: ${err instanceof Error ? err.message : String(err)}`);
            setRepos([]);
        })
            .finally(() => { if (!cancelled)
            setLoadingRepos(false); });
        return () => { cancelled = true; };
    }, [sessionId, uiState, refreshTick, fetchFn, basePath]);
    // Keep a valid selection — pick the first repo when the current selection
    // is missing from the list (initial load, or a repo just disappeared).
    useEffect(() => {
        if (repos.length === 0) {
            setSelectedRepo('');
            return;
        }
        if (!selectedRepo || !repos.find(r => r.path === selectedRepo)) {
            setSelectedRepo(repos[0].path);
        }
    }, [repos, selectedRepo]);
    // Fetch the four-pane view for the selected repo.
    useEffect(() => {
        if (!sessionId || !selectedRepo) {
            setView(null);
            return;
        }
        let cancelled = false;
        setLoadingView(true);
        setError(null);
        const url = `${basePath}/sessions/${sessionId}/git?repo=${encodeURIComponent(selectedRepo)}`;
        fetchFn(url)
            .then(async (r) => {
            if (!r.ok)
                throw new Error(`${r.status} ${await r.text()}`);
            return r.json();
        })
            .then(data => { if (!cancelled)
            setView(data); })
            .catch(err => {
            if (cancelled)
                return;
            setError(`git: ${err instanceof Error ? err.message : String(err)}`);
            setView(null);
        })
            .finally(() => { if (!cancelled)
            setLoadingView(false); });
        return () => { cancelled = true; };
    }, [sessionId, selectedRepo, uiState, refreshTick, fetchFn, basePath]);
    const toggleSection = useCallback((s) => {
        setOpenSections(prev => ({ ...prev, [s]: !prev[s] }));
    }, []);
    const sectionContent = useMemo(() => ({
        status: view?.status ?? '',
        diff_unstaged: view?.diff_unstaged ?? '',
        diff_staged: view?.diff_staged ?? '',
        log: view?.log ?? '',
    }), [view]);
    return (_jsxs("div", { className: "bc-split-pane bc-split-pane-git", children: [_jsxs("div", { className: "bc-split-pane-header", children: [_jsx("span", { className: "bc-split-pane-title", children: "Git" }), repos.length > 0 && (_jsx("select", { className: "bc-git-repo-select", value: selectedRepo, onChange: e => setSelectedRepo(e.target.value), title: "Switch repository", children: repos.map(r => (_jsx("option", { value: r.path, children: r.name }, r.path))) })), _jsx("span", { className: "bc-spacer" }), _jsx("button", { className: "bc-split-collapse-btn", onClick: refresh, title: "Refresh git data", "aria-label": "Refresh git data", disabled: loadingRepos || loadingView, children: "\u27F3" }), _jsx("button", { className: "bc-split-collapse-btn", onClick: onToggleCollapse, title: "Collapse git", "aria-label": "Collapse git", children: "\u25B8" })] }), _jsxs("div", { className: "bc-git-body", children: [error && _jsx("div", { className: "bc-git-error", children: error }), !error && repos.length === 0 && !loadingRepos && (_jsx("div", { className: "bc-git-empty", children: "No git repositories discovered yet for this session." })), !error && repos.length > 0 && view && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bc-git-branch", children: [_jsx("span", { className: "bc-git-branch-label", children: "on" }), _jsx("span", { className: "bc-git-branch-name", children: view.branch || '(unknown)' }), _jsx("span", { className: "bc-git-repo-path", title: view.repo, children: view.repo })] }), ['status', 'diff_unstaged', 'diff_staged', 'log'].map(s => {
                                const open = openSections[s];
                                const content = sectionContent[s];
                                return (_jsxs("div", { className: "bc-git-section", children: [_jsxs("button", { className: "bc-git-section-header", onClick: () => toggleSection(s), children: [_jsx("span", { className: "bc-git-section-chevron", children: open ? '▾' : '▸' }), _jsx("span", { className: "bc-git-section-title", children: SECTION_LABELS[s] }), !open && content && (_jsxs("span", { className: "bc-git-section-hint", children: [content.split('\n').length, " lines"] }))] }), open && (_jsx("pre", { className: "bc-git-section-body", children: content || _jsx("span", { className: "bc-git-section-empty", children: "(empty)" }) }))] }, s));
                            })] }))] })] }));
}
//# sourceMappingURL=GitPanel.js.map