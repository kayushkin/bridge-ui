import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../context';
import { UnifiedDiffView } from './tools/DiffView';
/** Which sections hold a unified diff. A named predicate rather than an inline
 *  `startsWith('diff')`: `diff_unstaged` and `diff_staged` are the only two, and a
 *  section added later that merely happens to begin with those letters should not
 *  silently start being colourised. */
function isDiffSection(section) {
    return section === 'diff_unstaged' || section === 'diff_staged';
}
const SECTION_LABELS = {
    status: 'Status',
    diff_unstaged: 'Unstaged',
    diff_staged: 'Staged',
    log: 'Log',
};
export function GitPanel({ sessionId, refetchSignal, gitRepos: repos, selectedRepo, setSelectedRepo, gitReposLoading: loadingRepos, gitReposError: reposError, refreshGitRepos, onToggleCollapse, style, paneKey, }) {
    const { fetch: fetchFn, basePath } = useBridgeConfig();
    const [view, setView] = useState(null);
    const [viewError, setViewError] = useState(null);
    const [loadingView, setLoadingView] = useState(false);
    const [openSections, setOpenSections] = useState({
        status: true,
        diff_unstaged: true,
        diff_staged: false,
        log: false,
    });
    // Bumped manually to force a view refetch even when nothing else changed.
    const [refreshTick, setRefreshTick] = useState(0);
    const refresh = useCallback(() => {
        refreshGitRepos();
        setRefreshTick(t => t + 1);
    }, [refreshGitRepos]);
    // Fetch the four-pane view for the selected repo. Repos themselves are
    // fetched at workspace level so they stay populated even when this pane
    // is hidden.
    useEffect(() => {
        if (!sessionId || !selectedRepo) {
            setView(null);
            return;
        }
        let cancelled = false;
        setLoadingView(true);
        setViewError(null);
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
            setViewError(`git: ${err instanceof Error ? err.message : String(err)}`);
            setView(null);
        })
            .finally(() => { if (!cancelled)
            setLoadingView(false); });
        return () => { cancelled = true; };
    }, [sessionId, selectedRepo, refetchSignal, refreshTick, fetchFn, basePath]);
    const error = reposError || viewError;
    const toggleSection = useCallback((s) => {
        setOpenSections(prev => ({ ...prev, [s]: !prev[s] }));
    }, []);
    const sectionContent = useMemo(() => ({
        status: view?.status ?? '',
        diff_unstaged: view?.diff_unstaged ?? '',
        diff_staged: view?.diff_staged ?? '',
        log: view?.log ?? '',
    }), [view]);
    return (_jsxs("div", { className: "bc-split-pane bc-split-pane-git", style: style, "data-pane": paneKey, children: [_jsxs("div", { className: "bc-split-pane-header bc-header-clickable", onClick: onToggleCollapse, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleCollapse();
                } }, role: "button", tabIndex: 0, title: "Collapse git", "aria-label": "Collapse git", children: [_jsx("span", { className: "bc-split-pane-title", children: "Git" }), repos.length > 0 && (_jsx("select", { className: "bc-git-repo-select", value: selectedRepo, onChange: e => setSelectedRepo(e.target.value), onClick: e => e.stopPropagation(), onKeyDown: e => e.stopPropagation(), title: "Switch repository", children: repos.map(r => (_jsx("option", { value: r.path, children: r.name }, r.path))) })), _jsx("span", { className: "bc-spacer" }), _jsx("button", { className: "bc-split-collapse-btn", onClick: e => { e.stopPropagation(); refresh(); }, title: "Refresh git data", "aria-label": "Refresh git data", disabled: loadingRepos || loadingView, children: "\u27F3" }), _jsx("span", { className: "bc-split-collapse-btn", "aria-hidden": "true", children: "\u25B8" })] }), _jsxs("div", { className: "bc-git-body", children: [error && _jsx("div", { className: "bc-git-error", children: error }), !error && repos.length === 0 && !loadingRepos && (_jsx("div", { className: "bc-git-empty", children: "No git repositories discovered yet for this session." })), !error && repos.length > 0 && view && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bc-git-branch", children: [_jsx("span", { className: "bc-git-branch-label", children: "on" }), _jsx("span", { className: "bc-git-branch-name", children: view.branch || '(unknown)' }), _jsx("span", { className: "bc-git-repo-path", title: view.repo, children: view.repo })] }), ['status', 'diff_unstaged', 'diff_staged', 'log'].map(s => {
                                const open = openSections[s];
                                const content = sectionContent[s];
                                return (_jsxs("div", { className: "bc-git-section", children: [_jsxs("button", { className: "bc-git-section-header", onClick: () => toggleSection(s), children: [_jsx("span", { className: "bc-git-section-chevron", children: open ? '▾' : '▸' }), _jsx("span", { className: "bc-git-section-title", children: SECTION_LABELS[s] }), !open && content && (_jsxs("span", { className: "bc-git-section-hint", children: [content.split('\n').length, " lines"] }))] }), open && (
                                        // The two DIFF sections are rendered as diffs; `status` and `log`
                                        // are not diffs and must not be coloured as though they were. A
                                        // `git status` line beginning `-` is a deleted file in a porcelain
                                        // listing, not a removed line, and `git log` prose starting with a
                                        // `+` is just prose — painting either red or green states something
                                        // the output does not say.
                                        //
                                        // ⚠️ `UnifiedDiffView`, NOT `DiffView`. `DiffView` takes a file's
                                        // before/after CONTENTS and computes the patch itself; the git
                                        // endpoint returns `git diff` output, already unified and often
                                        // spanning several files, so there are no two versions to hand it.
                                        isDiffSection(s) ? (content ? (_jsx(UnifiedDiffView, { diff: content })) : (_jsx("pre", { className: "bc-git-section-body", children: _jsx("span", { className: "bc-git-section-empty", children: "(empty)" }) }))) : (_jsx("pre", { className: "bc-git-section-body", children: content || _jsx("span", { className: "bc-git-section-empty", children: "(empty)" }) })))] }, s));
                            })] }))] })] }));
}
//# sourceMappingURL=GitPanel.js.map