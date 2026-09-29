import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useChatContext, type SessionSummary } from '@kayushkin/chat-core'
import type { Project, Rollup } from '@kayushkin/project-store-types'
import { useBridgeConfig } from '../../context'
import { formatAgeCompact, formatCost, timeAgo } from '../../utils'
import { useProjectStore } from '../../useProjectStore'
import {
  WAITING_WORK_STATE,
  cardsByWorkState,
  entityTypeHeading,
  filedSessionSpend,
  lastActivitySeconds,
  openCardCounts,
  ownedThingsByType,
  projectPathName,
  projectRollupPath,
  projectSections,
  sessionsFiledByProject,
  unmergedBranchCount,
  vocabularyPath,
  type ProjectTreeRow,
  type ProjectVocabulary,
} from '../../projects'
import styles from './ProjectsView.module.css'

// The projects, opened in the chat's workspace in place of the thread, as the
// work graph is (`?view=projects`, and `&project=` for one project's page).
// The landing page is a card per project, sub-projects under their parent and
// streams apart; a card opens the project's page. Everything a card counts is
// worked out by project-store's rollup on request; the rules for reading it
// are `src/projects.ts`, and this file fetches and draws.
//
// Ids are written in full everywhere, so the chat's reference detection and a
// copy of the text both carry the whole id.

/** How many rollups the landing page asks for at once. Each reaches
 *  kanban-store, work-graph-store and repo-store behind project-store. */
const ROLLUP_CONCURRENCY = 4

type RollupSlot = { rollup: Rollup; error: null } | { rollup: null; error: string }

async function readJSON<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.text()).trim()
    throw new Error(`${what}: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`)
  }
  return (await response.json()) as T
}

function ageFromSeconds(seconds: number): string | null {
  return seconds > 0 ? formatAgeCompact(new Date(seconds * 1000).toISOString()) : null
}

function spendText(spendUsd: number, sessionsWithoutSpend: number): string {
  return sessionsWithoutSpend > 0 ? `${formatCost(spendUsd)} (+${sessionsWithoutSpend} unknown)` : formatCost(spendUsd)
}

export interface ProjectsViewProps {
  /** The project whose page is open, or null for the landing page. */
  projectId: string | null
  onOpenProject: (projectId: string | null) => void
  /** Open a session in the chat, closing this view. */
  onSelectSession: (sessionId: string) => void
  onClose: () => void
}

export function ProjectsView({ projectId, onOpenProject, onSelectSession, onClose }: ProjectsViewProps): JSX.Element {
  const { fetch: fetchFn, projectStoreBasePath } = useBridgeConfig()
  const { api } = useChatContext()
  const { projects, sessionLinks, error: storeError, loaded, refresh } = useProjectStore()

  const [rollups, setRollups] = useState<ReadonlyMap<string, RollupSlot>>(new Map())
  const [vocabulary, setVocabulary] = useState<ProjectVocabulary | null>(null)
  const [summaries, setSummaries] = useState<ReadonlyMap<string, SessionSummary>>(new Map())
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [reloadSignal, setReloadSignal] = useState(0)
  const [loading, setLoading] = useState(false)

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const filedByProject = useMemo(() => sessionsFiledByProject(sessionLinks), [sessionLinks])
  const filedSessionIds = useMemo(
    () => [...new Set(sessionLinks.map((l) => l.entity_ref))].sort(),
    [sessionLinks],
  )
  const filedKey = filedSessionIds.join(',')

  useEffect(() => {
    if (!projectStoreBasePath) return
    let cancelled = false
    fetchFn(vocabularyPath(projectStoreBasePath))
      .then((r) => readJSON<ProjectVocabulary>(r, 'project-store vocabulary'))
      .then((v) => { if (!cancelled) setVocabulary(v) })
      .catch((error: Error) => console.error(error))
    return () => { cancelled = true }
  }, [fetchFn, projectStoreBasePath])

  // Every rollup on the landing page; only the open project's on its page.
  const wantedRollups = useMemo(
    () => (projectId ? [projectId] : projects.map((p) => p.id)),
    [projectId, projects],
  )
  const wantedKey = wantedRollups.join(',')
  useEffect(() => {
    if (!projectStoreBasePath || wantedKey === '') return
    let cancelled = false
    const ids = wantedKey.split(',')
    setLoading(true)
    let next = 0
    const worker = async (): Promise<void> => {
      while (!cancelled && next < ids.length) {
        const id = ids[next++]
        let slot: RollupSlot
        try {
          const rollup = await fetchFn(projectRollupPath(projectStoreBasePath, id)).then((r) =>
            readJSON<Rollup>(r, `rollup of ${id}`),
          )
          slot = { rollup, error: null }
        } catch (error) {
          slot = { rollup: null, error: error instanceof Error ? error.message : String(error) }
        }
        if (cancelled) return
        setRollups((previous) => new Map(previous).set(id, slot))
      }
    }
    void Promise.all(Array.from({ length: Math.min(ROLLUP_CONCURRENCY, ids.length) }, worker)).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchFn, projectStoreBasePath, wantedKey, reloadSignal])

  // The filed sessions' rows, for names, states and spend: one lookup by id,
  // because most of them are long past the sidebar's loaded page.
  useEffect(() => {
    if (filedKey === '') return
    let cancelled = false
    const ids = filedKey.split(',')
    api
      .getSummary({ sessionIds: ids, limit: ids.length })
      .then((answer) => {
        if (cancelled) return
        setSummaries(new Map(answer.sessions.map((s) => [s.sessionId, s])))
        setSummaryError(null)
      })
      .catch((error: Error) => { if (!cancelled) setSummaryError(error.message) })
    return () => { cancelled = true }
  }, [api, filedKey, reloadSignal])

  const reload = useCallback(() => {
    void refresh()
    setReloadSignal((n) => n + 1)
  }, [refresh])

  if (!projectStoreBasePath) {
    return (
      <div className="bc-workspace bc-workspace-focused">
        <ProjectsHeader title="Projects" onClose={onClose} />
        <p className={styles.notice}>
          This host does not proxy project-store, so there are no projects to show (the host sets
          <code> projectStoreBasePath</code>).
        </p>
      </div>
    )
  }

  const open = projectId ? projectsById.get(projectId) ?? null : null
  const errors = [storeError, summaryError].filter((e): e is string => !!e)

  return (
    <div className={`bc-workspace bc-workspace-focused ${styles.page}`} role="region" aria-label="Projects">
      <ProjectsHeader
        title={open ? projectPathName(open, projectsById) : 'Projects'}
        onBack={projectId ? () => onOpenProject(null) : undefined}
        onRefresh={reload}
        loading={loading}
        onClose={onClose}
      />
      {errors.map((e) => <p key={e} className={styles.error}>{e}</p>)}
      <div className={styles.scroll}>
        {!loaded ? (
          <p className={styles.notice}>Loading…</p>
        ) : projectId ? (
          open ? (
            <ProjectPage
              project={open}
              slot={rollups.get(open.id) ?? null}
              projectsById={projectsById}
              vocabulary={vocabulary}
              summaries={summaries}
              onOpenProject={onOpenProject}
              onSelectSession={onSelectSession}
            />
          ) : (
            <p className={styles.notice}>project-store has no live project {projectId}.</p>
          )
        ) : (
          <Landing
            projects={projects}
            rollups={rollups}
            filedByProject={filedByProject}
            summaries={summaries}
            onOpenProject={onOpenProject}
          />
        )}
      </div>
    </div>
  )
}

function ProjectsHeader({
  title,
  onBack,
  onRefresh,
  loading,
  onClose,
}: {
  title: string
  onBack?: () => void
  onRefresh?: () => void
  loading?: boolean
  onClose: () => void
}): JSX.Element {
  return (
    <div className="bc-header">
      <div className={`bc-header-row ${styles.headerRow}`}>
        {onBack ? (
          <button type="button" className="bc-ctrl-btn" onClick={onBack} title="All projects">← All projects</button>
        ) : (
          <span aria-hidden>▦</span>
        )}
        <span className="bc-session-name" style={{ fontWeight: 600 }}>{title}</span>
        <span className={styles.headerEnd}>
          {onRefresh && (
            <button type="button" className="bc-ctrl-btn" onClick={onRefresh} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          )}
          <button type="button" className="bc-ctrl-btn" onClick={onClose} aria-label="Close the projects" title="Close the projects">✕</button>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

function Landing({
  projects,
  rollups,
  filedByProject,
  summaries,
  onOpenProject,
}: {
  projects: Project[]
  rollups: ReadonlyMap<string, RollupSlot>
  filedByProject: ReadonlyMap<string, string[]>
  summaries: ReadonlyMap<string, SessionSummary>
  onOpenProject: (projectId: string) => void
}): JSX.Element {
  const sections = useMemo(() => projectSections(projects), [projects])
  if (projects.length === 0) return <p className={styles.notice}>project-store holds no live project.</p>
  const cards = (rows: ProjectTreeRow[]) => (
    <div className={styles.cardList}>
      {rows.map((row) => (
        <ProjectCard
          key={row.project.id}
          row={row}
          slot={rollups.get(row.project.id) ?? null}
          filedSessionIds={filedByProject.get(row.project.id) ?? []}
          summaries={summaries}
          onOpen={() => onOpenProject(row.project.id)}
        />
      ))}
    </div>
  )
  return (
    <>
      {sections.projects.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} page-title`}>Projects</h2>
          {cards(sections.projects)}
        </section>
      )}
      {sections.streams.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} page-title`}>Streams</h2>
          <p className={styles.muted}>Work that never finishes and needs a steady trickle of attention.</p>
          {cards(sections.streams)}
        </section>
      )}
    </>
  )
}

function ProjectCard({
  row,
  slot,
  filedSessionIds,
  summaries,
  onOpen,
}: {
  row: ProjectTreeRow
  slot: RollupSlot | null
  filedSessionIds: string[]
  summaries: ReadonlyMap<string, SessionSummary>
  onOpen: () => void
}): JSX.Element {
  const { project, depth } = row
  const rollup = slot?.rollup ?? null
  const spend = filedSessionSpend(filedSessionIds, summaries)
  const lastActivity = rollup ? ageFromSeconds(lastActivitySeconds(rollup, summaries)) : null
  return (
    <article
      className={`${styles.card} ${depth > 0 ? styles.cardChild : ''}`}
      style={{ marginLeft: depth * 24 }}
      data-project-id={project.id}
    >
      <header className={styles.cardHead}>
        <button type="button" className={styles.cardName} onClick={onOpen}>{project.name}</button>
        <StageChip stage={project.stage} />
        {lastActivity && <span className={styles.muted} title="Last activity">{lastActivity} ago</span>}
      </header>
      {project.goal && <p className={styles.goal}>{project.goal}</p>}
      {slot?.error && <p className={styles.error}>{slot.error}</p>}
      {!slot && <p className={styles.muted}>Loading…</p>}
      {rollup && (
        <div className={styles.stats}>
          <Stat label="open cards">
            {openCardCounts(rollup).length === 0 ? (
              '0'
            ) : (
              openCardCounts(rollup).map(({ workState, count }) => (
                <span
                  key={workState}
                  className={`${styles.stateChip} ${workState === WAITING_WORK_STATE ? styles.stateWaiting : ''}`}
                  title={`${count} open ${count === 1 ? 'card' : 'cards'} ${workState || 'in a column with no state'}`}
                >
                  {count} {workState.replace(/_/g, ' ')}
                </span>
              ))
            )}
          </Stat>
          <Stat label="unmerged branches">{unmergedBranchCount(rollup)}</Stat>
          <Stat label={`filed ${spend.count === 1 ? 'session' : 'sessions'}`}>
            {spend.count}
            {spend.count > 0 && <span className={styles.muted}> · {spendText(spend.spendUsd, spend.sessionsWithoutSpend)}</span>}
          </Stat>
        </div>
      )}
      {rollup && rollup.repos.length > 0 && (
        <p className={styles.deploys} title="Last deploy of each repo">
          {rollup.repos.map((repo, i) => {
            const age = repo.latest_deploy ? ageFromSeconds(repo.latest_deploy.created_at) : null
            return (
              <span key={repo.repo_store_id}>
                {i > 0 && ' · '}
                <span className={styles.mono}>{repo.name}</span> {age ? `${age}` : 'never deployed'}
              </span>
            )
          })}
        </p>
      )}
    </article>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{children}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

function StageChip({ stage }: { stage: string }): JSX.Element {
  return <span className={styles.stageChip} data-stage={stage}>{stage.replace(/_/g, ' ')}</span>
}

// ---------------------------------------------------------------------------
// One project's page
// ---------------------------------------------------------------------------

function ProjectPage({
  project,
  slot,
  projectsById,
  vocabulary,
  summaries,
  onOpenProject,
  onSelectSession,
}: {
  project: Project
  slot: RollupSlot | null
  projectsById: ReadonlyMap<string, Project>
  vocabulary: ProjectVocabulary | null
  summaries: ReadonlyMap<string, SessionSummary>
  onOpenProject: (projectId: string) => void
  onSelectSession: (sessionId: string) => void
}): JSX.Element {
  const { routes } = useBridgeConfig()
  const rollup = slot?.rollup ?? null
  const sessionLinks = rollup?.links.filter((l) => l.entity_type === 'session') ?? []
  const owned = rollup ? ownedThingsByType(rollup.links, vocabulary?.entity_types ?? []) : []
  const parent = projectsById.get(project.parent_id)
  const sessionName = (id: string) => summaries.get(id)?.displayName || id

  return (
    <div className={styles.projectPage} data-project-id={project.id}>
      <section className={styles.section}>
        <div className={styles.cardHead}>
          <h2 className={`${styles.pageTitle} page-title`}>{project.name}</h2>
          <StageChip stage={project.stage} />
          <span className={styles.muted}>{project.kind}</span>
          <span className={`${styles.mono} ${styles.muted}`}>{project.id}</span>
        </div>
        {parent && (
          <p className={styles.muted}>
            Part of <button type="button" className={styles.linkButton} onClick={() => onOpenProject(parent.id)}>{parent.name}</button>
          </p>
        )}
        <dl className={styles.facts}>
          <dt>Goal</dt>
          <dd>{project.goal || <span className={styles.muted}>not set</span>}</dd>
          <dt>Done when</dt>
          <dd>{project.done_when || <span className={styles.muted}>not set</span>}</dd>
        </dl>
      </section>

      {slot?.error && <p className={styles.error}>{slot.error}</p>}
      {!slot && <p className={styles.notice}>Loading…</p>}

      {rollup && rollup.children.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.subTitle}>Sub-projects</h3>
          <ul className={styles.plainList}>
            {rollup.children.map((child) => (
              <li key={child.id}>
                <button type="button" className={styles.linkButton} onClick={() => onOpenProject(child.id)}>{child.name}</button>{' '}
                <StageChip stage={child.stage} /> <span className={styles.muted}>{child.goal}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rollup && (
        <section className={styles.section}>
          <h3 className={styles.subTitle}>Cards</h3>
          {rollup.cards.length === 0 ? (
            <p className={styles.muted}>No card is linked to this project.</p>
          ) : (
            cardsByWorkState(rollup).map(({ workState, cards }) => (
              <div key={workState} className={styles.group}>
                <h4 className={`${styles.groupTitle} ${workState === WAITING_WORK_STATE ? styles.stateWaiting : ''}`}>
                  {workState ? workState.replace(/_/g, ' ') : 'in a column with no state'} ({cards.length})
                </h4>
                <ul className={styles.plainList}>
                  {cards.map((card) => (
                    <li key={card.card_id}>
                      {routes.card ? (
                        <RouterLink to={`${routes.card}/${encodeURIComponent(card.card_id)}`}>{card.title || card.card_id}</RouterLink>
                      ) : (
                        card.title || card.card_id
                      )}{' '}
                      <span className={styles.muted}>{card.status}</span>{' '}
                      <span className={`${styles.mono} ${styles.muted}`}>{card.card_id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {rollup && rollup.repos.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.subTitle}>Repos</h3>
          {rollup.repos.map((repo) => (
            <div key={repo.repo_store_id} className={styles.group}>
              <h4 className={styles.groupTitle}>
                <span className={styles.mono}>{repo.name}</span>{' '}
                <span className={styles.muted}>
                  {repo.latest_deploy
                    ? `deployed ${timeAgo(new Date(repo.latest_deploy.created_at * 1000).toISOString())} at ${repo.latest_deploy.commit_sha.slice(0, 7)} by ${repo.latest_deploy.deployed_by}`
                    : 'never deployed'}
                </span>
              </h4>
              {repo.unmerged_branches.length === 0 ? (
                <p className={styles.muted}>No unmerged branch.</p>
              ) : (
                <ul className={styles.plainList}>
                  {repo.unmerged_branches.map((branch) => (
                    <li key={branch.name}>
                      <span className={`${styles.mono} ${styles.branch}`}>{branch.name}</span>{' '}
                      <span className={styles.muted}>last commit {timeAgo(new Date(branch.committed_at * 1000).toISOString())}</span>
                      {branch.worktree_path && <span className={`${styles.mono} ${styles.muted}`}> {branch.worktree_path}</span>}
                      {branch.session_ids.map((id) => (
                        <button key={id} type="button" className={styles.sessionPill} onClick={() => onSelectSession(id)} title={id}>
                          {sessionName(id)}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {rollup && (
        <section className={styles.section}>
          <h3 className={styles.subTitle}>Filed sessions ({sessionLinks.length})</h3>
          {sessionLinks.length === 0 ? (
            <p className={styles.muted}>No session is filed under this project. File one from its header.</p>
          ) : (
            <ul className={styles.plainList}>
              {sessionLinks.map((link) => {
                const summary = summaries.get(link.entity_ref)
                return (
                  <li key={link.id} className={styles.sessionRow}>
                    <button type="button" className={styles.linkButton} onClick={() => onSelectSession(link.entity_ref)}>
                      {summary?.displayName || link.label || link.entity_ref}
                    </button>
                    <span className={`${styles.mono} ${styles.muted}`}>{link.entity_ref}</span>
                    {summary && <span className={styles.muted}>{summary.state}</span>}
                    {typeof summary?.spendUsd === 'number' && <span className={styles.muted}>{formatCost(summary.spendUsd)}</span>}
                    {summary?.updatedAt && <span className={styles.muted}>{timeAgo(summary.updatedAt)}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {rollup && owned.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.subTitle}>What it owns</h3>
          {owned.map(({ entityType, info, links }) => (
            <div key={entityType} className={styles.group}>
              <h4 className={styles.groupTitle} title={info?.meaning}>
                {entityTypeHeading(entityType)} <span className={styles.muted}>({info?.service ?? 'unknown store'})</span>
              </h4>
              <ul className={styles.plainList}>
                {links.map((link) => (
                  <li key={link.id}>
                    {/* The label is the owning store's name for the thing; the ref is
                        that store's id, said as such so a bare number reads as an id. */}
                    {link.label && link.label !== link.entity_ref ? `${link.label} ` : ''}
                    <span className={styles.muted}>
                      {info?.service ?? 'its store'} id{' '}
                      <span className={styles.mono}>{link.entity_ref}</span>
                    </span>
                    {link.note && <span className={styles.muted}> — {link.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
