import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBridgeConfig } from '../context'
import type { SessionUIState } from '../types'

interface GitRepo {
  path: string
  name: string
}

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
}

export function GitPanel({ sessionId, uiState, onToggleCollapse }: GitPanelProps) {
  const { fetch: fetchFn, basePath } = useBridgeConfig()

  const [repos, setRepos] = useState<GitRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [view, setView] = useState<GitView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loadingView, setLoadingView] = useState(false)
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    status: true,
    diff_unstaged: true,
    diff_staged: false,
    log: false,
  })
  // Bumped manually to force a refetch even when nothing else changed.
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  // Refetch repos on session change, on every turn boundary (uiState flips),
  // and on manual refresh.
  useEffect(() => {
    if (!sessionId) {
      setRepos([])
      setView(null)
      return
    }
    let cancelled = false
    setLoadingRepos(true)
    setError(null)
    fetchFn(`${basePath}/sessions/${sessionId}/git/repos`)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
        return r.json() as Promise<{ repos: GitRepo[] }>
      })
      .then(data => {
        if (cancelled) return
        setRepos(data.repos || [])
      })
      .catch(err => {
        if (cancelled) return
        setError(`repos: ${err instanceof Error ? err.message : String(err)}`)
        setRepos([])
      })
      .finally(() => { if (!cancelled) setLoadingRepos(false) })
    return () => { cancelled = true }
  }, [sessionId, uiState, refreshTick, fetchFn, basePath])

  // Keep a valid selection — pick the first repo when the current selection
  // is missing from the list (initial load, or a repo just disappeared).
  useEffect(() => {
    if (repos.length === 0) {
      setSelectedRepo('')
      return
    }
    if (!selectedRepo || !repos.find(r => r.path === selectedRepo)) {
      setSelectedRepo(repos[0].path)
    }
  }, [repos, selectedRepo])

  // Fetch the four-pane view for the selected repo.
  useEffect(() => {
    if (!sessionId || !selectedRepo) {
      setView(null)
      return
    }
    let cancelled = false
    setLoadingView(true)
    setError(null)
    const url = `${basePath}/sessions/${sessionId}/git?repo=${encodeURIComponent(selectedRepo)}`
    fetchFn(url)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
        return r.json() as Promise<GitView>
      })
      .then(data => { if (!cancelled) setView(data) })
      .catch(err => {
        if (cancelled) return
        setError(`git: ${err instanceof Error ? err.message : String(err)}`)
        setView(null)
      })
      .finally(() => { if (!cancelled) setLoadingView(false) })
    return () => { cancelled = true }
  }, [sessionId, selectedRepo, uiState, refreshTick, fetchFn, basePath])

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
    <div className="bc-split-pane bc-split-pane-git">
      <div className="bc-split-pane-header">
        <span className="bc-split-pane-title">Git</span>
        {repos.length > 0 && (
          <select
            className="bc-git-repo-select"
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
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
          onClick={refresh}
          title="Refresh git data"
          aria-label="Refresh git data"
          disabled={loadingRepos || loadingView}
        >⟳</button>
        <button
          className="bc-split-collapse-btn"
          onClick={onToggleCollapse}
          title="Collapse git"
          aria-label="Collapse git"
        >▸</button>
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
