import { useEffect, useRef, useState } from 'react'
import { useBridgeConfig } from '../context'
import { listBundles, listRepos, resolveBundles } from '../bundleStoreClient'
import type { FetchFn } from '../types'
import type { Bundle, BundleMemberKind, BundleResolution, RepoStoreRepo } from '../types-bundles'
import styles from './BridgeBundles.module.css'

/**
 * Top-level Bundles page: bundle-store's curated session bundles — named,
 * inheritable sets of skills and tools a session is given by its repo's tags
 * and its task's tags — and a preview of what `POST /resolve` would hand a
 * session in a given repo.
 *
 * Left, every bundle with its match tags and members. Middle, repo-store's
 * repos with their effective tags, and the task tags to resolve with. Right,
 * the resolution for the selected repo, read again whenever the task tags
 * change. Read-only. A refusal from either store is shown in place, in the
 * server's own words.
 *
 * Renders nothing when the host passed no `bundleStoreBasePath`, which is also
 * when `BridgeLayout` shows no Bundles tab. Without `repoStoreBasePath` the
 * bundles still list and the preview column says there are no repos to pick.
 */
export function BridgeBundles() {
  const { fetch: fetchFn, bundleStoreBasePath, repoStoreBasePath } = useBridgeConfig()
  if (!bundleStoreBasePath) return null
  return <BundlesPage fetchFn={fetchFn} bundleStoreBase={bundleStoreBasePath} repoStoreBase={repoStoreBasePath} />
}

const OWNING_STORE: Record<BundleMemberKind, string> = { skill: 'skill-store', tool: 'tool-store' }
const MEMBER_CLASS: Record<BundleMemberKind, string> = { skill: styles.skill, tool: styles.tool }

function parseTaskTags(text: string): string[] {
  return text.split(',').map(t => t.trim()).filter(Boolean)
}

interface HeldResolution {
  repoID: number
  taskTagsKey: string
  value: BundleResolution
}

function BundlesPage({ fetchFn, bundleStoreBase, repoStoreBase }: {
  fetchFn: FetchFn
  bundleStoreBase: string
  repoStoreBase: string
}) {
  const [bundles, setBundles] = useState<Bundle[] | null>(null)
  const [bundlesError, setBundlesError] = useState<string | null>(null)
  const [repos, setRepos] = useState<RepoStoreRepo[] | null>(null)
  const [reposError, setReposError] = useState<string | null>(null)

  const [taskTagsText, setTaskTagsText] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<RepoStoreRepo | null>(null)
  const [resolution, setResolution] = useState<HeldResolution | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  // Reads race: a slow resolution for one repo must not land after the answer
  // for the repo picked next. Each read takes a ticket and only the latest one
  // may set state.
  const resolveTicket = useRef(0)

  const taskTags = parseTaskTags(taskTagsText)
  const taskTagsKey = taskTags.join(',')

  useEffect(() => {
    let current = true
    listBundles(fetchFn, bundleStoreBase).then(result => {
      if (!current) return
      if (result.ok) { setBundles(result.value ?? []); setBundlesError(null) } else setBundlesError(result.error)
    })
    return () => { current = false }
  }, [fetchFn, bundleStoreBase])

  useEffect(() => {
    if (!repoStoreBase) return
    let current = true
    listRepos(fetchFn, repoStoreBase).then(result => {
      if (!current) return
      if (result.ok) { setRepos(result.value ?? []); setReposError(null) } else setReposError(result.error)
    })
    return () => { current = false }
  }, [fetchFn, repoStoreBase])

  useEffect(() => {
    if (!selectedRepo) return
    const ticket = ++resolveTicket.current
    setResolveError(null)
    const tags = taskTagsKey ? taskTagsKey.split(',') : []
    resolveBundles(fetchFn, bundleStoreBase, selectedRepo.effective_tags ?? [], tags).then(result => {
      if (ticket !== resolveTicket.current) return
      if (result.ok) {
        setResolution({ repoID: selectedRepo.id, taskTagsKey, value: result.value })
      } else {
        setResolveError(result.error)
      }
    })
  }, [fetchFn, bundleStoreBase, selectedRepo, taskTagsKey])

  // Only a resolution for the repo and task tags on screen now is shown; one
  // for the previous pick would put another repo's skills under this repo's name.
  const currentResolution = resolution && selectedRepo
    && resolution.repoID === selectedRepo.id && resolution.taskTagsKey === taskTagsKey
    ? resolution.value : null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Bundles</h2>
        <p className={styles.subtitle}>
          Curated skill and tool bundles, given to a session by its repo&apos;s tags and its task&apos;s tags.
          Pick a repo to preview what a session there would resolve to.
        </p>
      </div>

      <div className={styles.columns}>
        <section className={styles.column} aria-label="Bundles">
          <h3 className={styles.heading}>Bundles{bundles ? ` (${bundles.length})` : ''}</h3>
          {bundlesError && <p className={styles.error}>{bundlesError}</p>}
          {!bundles && !bundlesError && <div className={styles.empty}>Loading bundles…</div>}
          {bundles && bundles.length === 0 && <div className={styles.empty}>bundle-store holds no bundles.</div>}
          {bundles?.map(b => <BundleCard key={b.id} bundle={b} />)}
        </section>

        <section className={styles.column} aria-label="Repos">
          <h3 className={styles.heading}>Repos{repos ? ` (${repos.length})` : ''}</h3>
          {!repoStoreBase ? (
            <div className={styles.empty}>This host proxies no repo-store, so there are no repos to preview.</div>
          ) : (
            <>
              <input
                className={styles.taskInput}
                placeholder="task tags, comma-separated (e.g. perf)"
                aria-label="Task tags"
                value={taskTagsText}
                onChange={e => setTaskTagsText(e.target.value)}
              />
              {reposError && <p className={styles.error}>{reposError}</p>}
              {!repos && !reposError && <div className={styles.empty}>Loading repos…</div>}
              {repos && repos.length === 0 && <div className={styles.empty}>repo-store holds no repos.</div>}
              {repos && repos.length > 0 && (
                <ul className={styles.repoList}>
                  {repos.map(r => {
                    const selected = selectedRepo?.id === r.id
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={`${styles.repoRow} ${selected ? styles.repoRowSelected : ''}`}
                          aria-pressed={selected}
                          onClick={() => setSelectedRepo(r)}
                        >
                          <span className={styles.repoName}>{r.name}</span>
                          <span className={styles.chips}>
                            {(r.effective_tags ?? []).map(t => (
                              <span key={t} className={`${styles.chip} ${styles.repoTag}`}>{t}</span>
                            ))}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        <section className={styles.column} aria-label="Resolve preview">
          <h3 className={styles.heading}>Resolve preview</h3>
          {!selectedRepo && <div className={styles.empty}>Select a repo to preview its bundles.</div>}
          {selectedRepo && resolveError && <p className={styles.error}>{resolveError}</p>}
          {selectedRepo && !resolveError && !currentResolution && <div className={styles.empty}>Resolving…</div>}
          {selectedRepo && currentResolution && (
            <ResolutionCard repoName={selectedRepo.name} resolution={currentResolution} />
          )}
        </section>
      </div>
    </div>
  )
}

/** One bundle: its display name and unique name, what it extends, whether it
 *  is enabled, the tags that select it and the members it contributes. */
export function BundleCard({ bundle }: { bundle: Bundle }) {
  const matchTags = bundle.match_tags ?? []
  const members = bundle.members ?? []
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        {bundle.display_name && <span className={styles.name}>{bundle.display_name}</span>}
        <code className={styles.bundleName}>{bundle.name}</code>
        {bundle.extends && <span className={styles.muted}>extends {bundle.extends}</span>}
        {!bundle.enabled && <span className={styles.disabledBadge}>disabled</span>}
      </div>
      {bundle.description && <div className={styles.description}>{bundle.description}</div>}
      {matchTags.length > 0 && (
        <div className={styles.chips}>
          {matchTags.map(t => <span key={t} className={`${styles.chip} ${styles.matchTag}`}>{t}</span>)}
        </div>
      )}
      {members.length > 0 && (
        <div className={styles.chips}>
          {members.map(m => (
            <MemberChip key={`${m.kind}:${m.id}`} kind={m.kind} id={m.id} name={m.name} condition={m.condition} />
          ))}
        </div>
      )}
      {(bundle.model || bundle.effort) && (
        <div className={styles.muted}>defaults: {[bundle.model, bundle.effort].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  )
}

/** A member as a chip. The id is always shown: it is the member's identity,
 *  and the name beside it is only a label the owning store may share with
 *  another row. */
function MemberChip({ kind, id, name, condition }: {
  kind: BundleMemberKind
  id: number
  name?: string
  condition?: string
}) {
  return (
    <span className={`${styles.chip} ${MEMBER_CLASS[kind]}`} title={`${OWNING_STORE[kind]} ${kind} id ${id}`}>
      {name && <>{name} </>}
      <span className={styles.memberID}>#{id}</span>
      {condition && <em className={styles.condition}> if {condition}</em>}
    </span>
  )
}

function ResolutionCard({ repoName, resolution }: { repoName: string; resolution: BundleResolution }) {
  const bundles = resolution.bundles ?? []
  const skills = resolution.skills ?? []
  const tools = resolution.tools ?? []
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.name}>{repoName}</span>
      </div>
      <div className={styles.previewRow}>
        <span className={styles.previewLabel}>bundles</span>
        {bundles.length
          ? bundles.map(b => <span key={b.id} className={`${styles.chip} ${styles.matchTag}`}>{b.name}</span>)
          : <span className={styles.muted}>none</span>}
      </div>
      <div className={styles.previewRow}>
        <span className={styles.previewLabel}>skills</span>
        {skills.length
          ? skills.map(s => <MemberChip key={s.id} kind="skill" id={s.id} name={s.name} />)
          : <span className={styles.muted}>none</span>}
      </div>
      <div className={styles.previewRow}>
        <span className={styles.previewLabel}>tools</span>
        {tools.length
          ? tools.map(t => <MemberChip key={t.id} kind="tool" id={t.id} name={t.name} />)
          : <span className={styles.muted}>none</span>}
      </div>
      {(resolution.model || resolution.effort) && (
        <div className={styles.previewRow}>
          <span className={styles.previewLabel}>defaults</span>
          <span className={styles.muted}>{[resolution.model, resolution.effort].filter(Boolean).join(' · ')}</span>
        </div>
      )}
    </div>
  )
}
