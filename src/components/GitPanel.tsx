import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBridgeConfig } from '../context'
import type { SessionUIState } from '../types'
import { useWorkspace } from './chat/WorkspaceContext'

interface GitView {
  repo: string
  branch: string
  status: string
  diff_unstaged: string
  diff_staged: string
  log: string
}

type Section = 'status' | 'diff_unstaged' | 'diff_staged' | 'log'

const SECTION_LABELS: Record<Section, string> = {
  status: 'Status',
  diff_unstaged: 'Unstaged',
  diff_staged: 'Staged',
  log: 'Log',
}

interface GitPanelProps {
  sessionId: string
  uiState: SessionUIState
  onToggleCollapse: () => void
  style?: React.CSSProperties
  paneKey?: string
}

export function GitPanel({ sessionId, uiState, onToggleCollapse, style, paneKey }: GitPanelProps) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()
  // Repos + selection are owned by the surrounding Workspace and shared with
  // SessionHeader's repo dropdown so both reflect the same selection.
  const {
    gitRepos: repos,
    selectedRepo,
    setSelectedRepo,
    gitReposLoading: loadingRepos,
    gitReposError: reposError,
    refreshGitRepos,
  } = useWorkspace()

  const [view, setView] = useState<GitView | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [loadingView, setLoadingView] = useState(false)
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    status: true,
    diff_unstaged: true,
    diff_staged: false,
    log: false,
  })
  // Bumped manually to force a view refetch even when nothing else changed.
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => {
    refreshGitRepos()
    setRefreshTick(t => t + 1)
  }, [refreshGitRepos])

  // Fetch the four-pane view for the selected repo. Repos themselves are
  // fetched at workspace level so they stay populated even when this pane
  // is hidden.
  useEffect(() => {
    if (!sessionId || !selectedRepo) {
      setView(null)
      return
    }
    let cancelled = false
    setLoadingView(true)
    setViewError(null)
    const url = `${basePath}/sessions/${sessionId}/git?repo=${encodeURIComponent(selectedRepo)}`
    fetchFn(url)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
        return r.json() as Promise<GitView>
      })
      .then(data => { if (!cancelled) setView(data) })
      .catch(err => {
        if (cancelled) return
        setViewError(`git: ${err instanceof Error ? err.message : String(err)}`)
        setView(null)
      })
      .finally(() => { if (!cancelled) setLoadingView(false) })
    return () => { cancelled = true }
  }, [sessionId, selectedRepo, uiState, refreshTick, fetchFn, basePath])

  const error = reposError || viewError

  const toggleSection = useCallback((s: Section) => {
    setOpenSections(prev => ({ ...prev, [s]: !prev[s] }))
  }, [])

  const sectionContent = useMemo<Record<Section, string>>(() => ({
    status: view?.status ?? '',
    diff_unstaged: view?.diff_unstaged ?? '',
    diff_staged: view?.diff_staged ?? '',
    log: view?.log ?? '',
  }), [view])

  return (
    <div className="bc-split-pane bc-split-pane-git" style={style} data-pane={paneKey}>
      <div
        className="bc-split-pane-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() } }}
        role="button"
        tabIndex={0}
        title="Collapse git"
        aria-label="Collapse git"
      >
        <span className="bc-split-pane-title">Git</span>
        {repos.length > 0 && (
          <select
            className="bc-git-repo-select"
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            title="Switch repository"
          >
            {repos.map(r => (
              <option key={r.path} value={r.path}>{r.name}</option>
            ))}
          </select>
        )}
        <span className="bc-spacer" />
        <button
          className="bc-split-collapse-btn"
          onClick={e => { e.stopPropagation(); refresh() }}
          title="Refresh git data"
          aria-label="Refresh git data"
          disabled={loadingRepos || loadingView}
        >⟳</button>
        <span className="bc-split-collapse-btn" aria-hidden="true">▸</span>
      </div>
      <div className="bc-git-body">
        {error && <div className="bc-git-error">{error}</div>}
        {!error && repos.length === 0 && !loadingRepos && (
          <div className="bc-git-empty">
            No git repositories discovered yet for this session.
          </div>
        )}
        {!error && repos.length > 0 && view && (
          <>
            <div className="bc-git-branch">
              <span className="bc-git-branch-label">on</span>
              <span className="bc-git-branch-name">{view.branch || '(unknown)'}</span>
              <span className="bc-git-repo-path" title={view.repo}>{view.repo}</span>
            </div>
            {(['status', 'diff_unstaged', 'diff_staged', 'log'] as Section[]).map(s => {
              const open = openSections[s]
              const content = sectionContent[s]
              return (
                <div key={s} className="bc-git-section">
                  <button
                    className="bc-git-section-header"
                    onClick={() => toggleSection(s)}
                  >
                    <span className="bc-git-section-chevron">{open ? '▾' : '▸'}</span>
                    <span className="bc-git-section-title">{SECTION_LABELS[s]}</span>
                    {!open && content && (
                      <span className="bc-git-section-hint">{content.split('\n').length} lines</span>
                    )}
                  </button>
                  {open && (
                    <pre className="bc-git-section-body">
                      {content || <span className="bc-git-section-empty">(empty)</span>}
                    </pre>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
