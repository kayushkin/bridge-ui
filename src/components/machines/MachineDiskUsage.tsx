import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiskUsageChildren, DiskUsageDeletionCheck, DiskUsageEntry, DiskUsageScan, DiskUsageWSLCompaction, DiskUsageWSLCompactionRun, DiskUsageWSLDisk } from '@kayushkin/llm-bridge-types'
import type { BridgeConfig } from '../../context'
import { formatBytes, formatPercent, percentOf } from '../../machineStats'
import {
  DISK_USAGE_BUSY_POLL_MS,
  DISK_USAGE_IDLE_POLL_MS,
  browsableScanTime,
  confirmationMatches,
  deletionStateText,
  diskUsageEntriesPath,
  diskUsageErrorText,
  diskUsageIsBusy,
  diskUsagePath,
  driveButtonName,
  entryContentsText,
  entryDisplayName,
  entryOffersDeletion,
  scanOfDrive,
  shareOfParent,
  wslCompactionFreedBytes,
  wslCompactionOffer,
  wslDiskReclaimableBytes,
  type MachineDiskDeletionAnswer,
  type MachineDiskDeletionRecord,
  type MachineDiskUsageView,
} from '../../machineDiskUsage'
import { timeAgo } from '../../utils'
import styles from './MachineDiskUsage.module.css'

/**
 * Disk usage for one runner machine, inside its open strip on the Machines
 * page: its drives, a scan of each, the scan as a folder tree with sizes,
 * largest first, and a Delete button on each file and folder.
 *
 * Deleting asks the machine first (`deletion-checks`): the dialog shows its
 * refusal, or its warnings and what will go, and the Delete button stays
 * off until the owner types the item's name. The server checks the name
 * again and records the deletion before the runner is asked; the runner and
 * its Windows helper refuse drive roots, Windows, the folders Windows and
 * programs depend on, WSL's disks, links and cloud files (llm-bridge
 * `msg/disk_usage.go`). Deleting is for good: nothing goes to the Recycle Bin.
 */
export function MachineDiskUsage({ serverConfig, machineID }: { serverConfig: BridgeConfig; machineID: string }) {
  const { fetch: fetchFn, basePath } = serverConfig
  const [view, setView] = useState<MachineDiskUsageView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drive, setDrive] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DiskUsageEntry | null>(null)
  // Bumped when the tree the runner holds changed (a scan or a deletion
  // ended), so every open folder reads its entries again.
  const [treeRevision, setTreeRevision] = useState(0)
  const lastEnded = useRef<string>('')

  const load = useCallback(async () => {
    try {
      const res = await fetchFn(`${basePath}${diskUsagePath(machineID)}`)
      const body = await res.text()
      if (!res.ok) {
        setError(diskUsageErrorText(res.status, body, 'GET disk-usage'))
        return
      }
      const next = JSON.parse(body) as MachineDiskUsageView
      setView(next)
      setError(null)
      // What ended since the last read: a scan's finish time, a deletion's end.
      const ended = [
        ...(next.status?.scans ?? []).map(scan => `${scan.drive}:${scan.state}:${scan.finished_at ?? ''}`),
        `${next.status?.deletion?.deletion_id ?? ''}:${next.status?.deletion?.state ?? ''}`,
      ].join('|')
      if (lastEnded.current && ended !== lastEnded.current) setTreeRevision(revision => revision + 1)
      lastEnded.current = ended
    } catch (err) {
      setError(`GET disk-usage: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [fetchFn, basePath, machineID])

  const busy = diskUsageIsBusy(view?.status)
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), busy ? DISK_USAGE_BUSY_POLL_MS : DISK_USAGE_IDLE_POLL_MS)
    return () => clearInterval(timer)
  }, [load, busy])

  const drives = view?.status?.drives ?? []
  useEffect(() => {
    if (drive === null && drives.length > 0) setDrive(drives[0].drive)
  }, [drive, drives])

  // postAndKeep leaves showing a refusal to the caller; post also shows one
  // that is not a 409 beside the scan buttons.
  const postAndKeep = async (path: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> => {
    const res = await fetchFn(`${basePath}${diskUsagePath(machineID)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: res.ok, status: res.status, text: await res.text() }
  }
  const post = async (path: string, body: unknown, verb: string): Promise<{ ok: boolean; status: number; text: string }> => {
    const answer = await postAndKeep(path, body)
    if (!answer.ok && answer.status !== 409) setActionError(diskUsageErrorText(answer.status, answer.text, verb))
    return answer
  }

  const startScan = async (driveToScan: string) => {
    setActionError(null)
    const answer = await post('/scans', { drive: driveToScan }, 'start scan')
    if (answer.status === 409) setActionError(diskUsageErrorText(409, answer.text, 'start scan'))
    void load()
  }

  if (error && !view) return <p className={styles.error}>{error}</p>
  if (!view) return <p className={styles.muted}>Asking the machine about its drives…</p>
  if (!view.available) {
    return (
      <div className={styles.body}>
        <p className={styles.notice}>{view.unavailable_reason ?? 'Disk usage is not available on this machine.'}</p>
        <DeletionRecords deletions={view.deletions} />
      </div>
    )
  }

  const selectedDrive = drives.find(item => item.drive === drive)
  const scan = drive ? scanOfDrive(view.status, drive) : undefined
  const scannedAt = browsableScanTime(scan)
  const deletion = view.status?.deletion

  return (
    <div className={`${styles.body} bc-disk-usage`}>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.drives} role="group" aria-label="Drives">
        {drives.map(item => {
          const used = item.total_bytes - item.free_bytes
          const itemScan = scanOfDrive(view.status, item.drive)
          return (
            <button
              key={item.drive}
              type="button"
              className={`${styles.drive} ${item.drive === drive ? styles.driveSelected : ''}`}
              aria-pressed={item.drive === drive}
              onClick={() => setDrive(item.drive)}
            >
              <span className={styles.driveName}>{driveButtonName(item)}</span>
              <span className={styles.track}><span className={styles.fill} style={{ width: `${percentOf(used, item.total_bytes) ?? 0}%` }} /></span>
              <span className={styles.muted}>{formatBytes(item.free_bytes)} free of {formatBytes(item.total_bytes)}</span>
              <span className={styles.muted}>{scanStateText(itemScan)}</span>
            </button>
          )
        })}
      </div>

      {drive ? (
        <div className={styles.scanRow}>
          {scan?.state === 'running' ? (
            <span>
              Scanning {drive}: {scan.scanned_entry_count.toLocaleString()} entries, {formatBytes(scan.scanned_bytes)} counted so far.
              {' '}A full drive takes a few minutes.
            </span>
          ) : (
            <button type="button" className={styles.button} onClick={() => void startScan(drive)}>
              {scannedAt ? `Scan ${drive} again` : `Scan ${drive}`}
            </button>
          )}
          {scannedAt ? <span className={styles.muted}>Showing the scan from {timeAgo(scannedAt)} ({new Date(scannedAt).toLocaleString()}).</span> : null}
          {scan?.state === 'failed' ? <p className={styles.error}>The scan failed: {scan.error}</p> : null}
        </div>
      ) : null}
      {actionError ? <p className={styles.error}>{actionError}</p> : null}

      {deletion?.state === 'running' ? (
        <p className={styles.notice}>
          Deleting {deletion.path}: {formatBytes(deletion.deleted_bytes)} of about {formatBytes(deletion.expected_size_bytes)} so far
          {deletion.failed_entry_count ? `, ${deletion.failed_entry_count} could not be deleted` : ''}.
        </p>
      ) : null}

      {selectedDrive?.kind === 'wsl' ? (
        <p className={styles.muted}>
          Inside WSL the scan counts the space files take on disk, each hard-linked file once, and stays on WSL's own file system:
          Windows' drives under /mnt are shown but not entered. Only things in your home folder and the temporary folders can be deleted here.
        </p>
      ) : null}
      {drive && scannedAt && selectedDrive ? (
        <div className={styles.tree} role="tree" aria-label={`What fills ${drive}`}>
          <div className={styles.treeHeading} aria-hidden="true">
            <span>Name</span><span>Size</span><span>Share of folder</span><span>Contents</span><span />
          </div>
          <TreeFolder
            serverConfig={serverConfig}
            machineID={machineID}
            path={selectedDrive?.root_path ?? ''}
            depth={0}
            parentSizeBytes={0}
            treeRevision={treeRevision}
            onDelete={entry => setDeleting(entry)}
            deletionRunning={deletion?.state === 'running'}
          />
        </div>
      ) : drive && scan?.state !== 'running' ? (
        <p className={styles.notice}>{drive} has not been scanned since the runner started. A scan reads every folder on the drive; on a full 4 TB drive it took about two minutes.</p>
      ) : null}

      {(view.status?.errors ?? []).map(text => <p key={text} className={styles.error}>{text}</p>)}
      <WSLDisks
        disks={view.status?.wsl_disks ?? []}
        compaction={view.status?.wsl_compaction}
        post={(path, body) => postAndKeep(path, body)}
        onChanged={() => void load()}
      />
      <DeletionRecords deletions={view.deletions} />

      {deleting ? (
        <DeleteDialog
          entry={deleting}
          check={(path: string) => post('/deletion-checks', { path }, 'check deletion')}
          remove={(body: unknown) => post('/deletions', body, 'delete')}
          onClose={() => { setDeleting(null); void load() }}
        />
      ) : null}
    </div>
  )
}

function scanStateText(scan: DiskUsageScan | undefined): string {
  if (!scan) return 'not scanned'
  if (scan.state === 'running') return 'scanning…'
  if (scan.state === 'failed') return 'scan failed'
  return scan.finished_at ? `scanned ${timeAgo(scan.finished_at)}` : 'scanned'
}

/** A folder's own row and, once opened, the rows of what is inside it. The
 *  drive root is drawn open, with no row of its own. */
function TreeFolder({ serverConfig, machineID, path, depth, parentSizeBytes, treeRevision, onDelete, deletionRunning, entry }: {
  serverConfig: BridgeConfig
  machineID: string
  path: string
  depth: number
  parentSizeBytes: number
  treeRevision: number
  onDelete: (entry: DiskUsageEntry) => void
  deletionRunning: boolean
  entry?: DiskUsageEntry
}) {
  const isRoot = depth === 0
  const [open, setOpen] = useState(isRoot)
  const [children, setChildren] = useState<DiskUsageChildren | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { fetch: fetchFn, basePath } = serverConfig

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchFn(`${basePath}${diskUsageEntriesPath(machineID, path)}`)
        const body = await res.text()
        if (cancelled) return
        if (!res.ok) {
          setError(diskUsageErrorText(res.status, body, 'GET entries'))
          return
        }
        setChildren(JSON.parse(body) as DiskUsageChildren)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(`GET entries: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
    return () => { cancelled = true }
  }, [open, fetchFn, basePath, machineID, path, treeRevision])

  const shown = entry ?? children?.entry
  const sizeOfThis = shown?.size_bytes ?? 0
  return (
    <>
      {!isRoot && entry ? (
        <EntryRow
          entry={entry}
          depth={depth}
          parentSizeBytes={parentSizeBytes}
          open={open}
          onToggle={entry.has_children ? () => setOpen(value => !value) : undefined}
          onDelete={onDelete}
          deletionRunning={deletionRunning}
        />
      ) : null}
      {isRoot && children ? (
        <div className={styles.rootSummary}>
          {children.entry.name}: {formatBytes(children.entry.size_bytes)} in {entryContentsText(children.entry)}
          {children.entry.unreadable_directory_count ? `; ${children.entry.unreadable_directory_count.toLocaleString()} folders could not be read` : ''}
        </div>
      ) : null}
      {open && error ? <p className={styles.error} style={{ marginLeft: depth * 18 }}>{error}</p> : null}
      {open && children
        ? children.children.map((child, index) =>
          child.kind === 'directory' && child.has_children ? (
            <TreeFolder
              key={child.path || `smaller-${index}`}
              serverConfig={serverConfig}
              machineID={machineID}
              path={child.path}
              depth={depth + 1}
              parentSizeBytes={sizeOfThis}
              treeRevision={treeRevision}
              onDelete={onDelete}
              deletionRunning={deletionRunning}
              entry={child}
            />
          ) : (
            <EntryRow
              key={child.path || `smaller-${index}`}
              entry={child}
              depth={depth + 1}
              parentSizeBytes={sizeOfThis}
              open={false}
              onDelete={onDelete}
              deletionRunning={deletionRunning}
            />
          ))
        : null}
    </>
  )
}

function EntryRow({ entry, depth, parentSizeBytes, open, onToggle, onDelete, deletionRunning }: {
  entry: DiskUsageEntry
  depth: number
  parentSizeBytes: number
  open: boolean
  onToggle?: () => void
  onDelete: (entry: DiskUsageEntry) => void
  deletionRunning: boolean
}) {
  const share = shareOfParent(entry, parentSizeBytes)
  const notes = [
    entry.kind === 'link' ? 'link, not followed' : '',
    entry.kind === 'mount_point' ? 'another file system, not scanned' : '',
    entry.unreadable_directory_count ? `${entry.unreadable_directory_count.toLocaleString()} unreadable` : '',
    entry.cloud_only_file_count ? `${entry.cloud_only_file_count.toLocaleString()} cloud-only` : '',
    entry.partly_deleted ? 'partly deleted' : '',
  ].filter(Boolean)
  return (
    <div className={styles.row} role="treeitem" aria-expanded={onToggle ? open : undefined} aria-level={depth}>
      <span className={styles.name} style={{ paddingLeft: (depth - 1) * 18 }}>
        {onToggle ? (
          <button type="button" className={styles.expand} aria-label={open ? `Close ${entry.name}` : `Open ${entry.name}`} onClick={onToggle}>
            {open ? '▾' : '▸'}
          </button>
        ) : <span className={styles.expandSpace} />}
        <span className={styles.kind} aria-hidden="true">{entry.kind === 'directory' ? '📁' : entry.kind === 'link' ? '🔗' : entry.kind === 'smaller_items' ? '⋯' : entry.kind === 'mount_point' ? '💽' : '📄'}</span>
        <span className={entry.kind === 'smaller_items' ? styles.muted : undefined} title={entry.path || undefined}>{entryDisplayName(entry)}</span>
        {notes.length ? <span className={styles.note}>{notes.join(' · ')}</span> : null}
      </span>
      <span className={styles.size}>{formatBytes(entry.size_bytes)}</span>
      <span className={styles.share}>
        <span className={styles.track}><span className={styles.fill} style={{ width: `${share}%` }} /></span>
        <span className={styles.muted}>{share >= 0.1 ? `${share.toFixed(share >= 10 ? 0 : 1)}%` : '<0.1%'}</span>
      </span>
      <span className={styles.muted}>{entryContentsText(entry)}</span>
      <span>
        {entryOffersDeletion(entry, false) ? (
          <button type="button" className={styles.deleteButton} disabled={deletionRunning} title={deletionRunning ? 'A deletion is running' : `Delete ${entry.path}`} onClick={() => onDelete(entry)}>
            Delete
          </button>
        ) : null}
      </span>
    </div>
  )
}

type Post = (body: unknown) => Promise<{ ok: boolean; status: number; text: string }>

function DeleteDialog({ entry, check, remove, onClose }: {
  entry: DiskUsageEntry
  check: (path: string) => Promise<{ ok: boolean; status: number; text: string }>
  remove: Post
  onClose: () => void
}) {
  const [verdict, setVerdict] = useState<DiskUsageDeletionCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const answer = await check(entry.path)
      if (cancelled) return
      if (!answer.ok) {
        setError(diskUsageErrorText(answer.status, answer.text, 'check deletion'))
        return
      }
      setVerdict(JSON.parse(answer.text) as DiskUsageDeletionCheck)
    })()
    return () => { cancelled = true }
    // Asked once per dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.path])

  const confirmed = verdict ? confirmationMatches(typed, verdict.confirmation_name) : false
  const submit = async () => {
    if (!verdict || !confirmed) return
    setSending(true)
    const answer = await remove({
      path: verdict.path,
      kind: verdict.kind,
      confirmation_name: typed,
      expected_size_bytes: verdict.size_bytes,
    })
    setSending(false)
    if (answer.status === 202) {
      setResult(`Deleting ${verdict.path}. The page shows its progress, and the record below says how it ended.`)
      return
    }
    if (answer.status === 409) {
      try {
        const refused = JSON.parse(answer.text) as MachineDiskDeletionAnswer
        if (refused.deletion_check?.refusal_reason) {
          setError(`The machine refused: ${refused.deletion_check.refusal_reason}`)
          return
        }
      } catch {
        // The error envelope; read below.
      }
    }
    setError(diskUsageErrorText(answer.status, answer.text, 'delete'))
  }

  return (
    <div className={styles.dialogBackdrop} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={`Delete ${entry.name}`}>
        <h4 className={styles.dialogTitle}>Delete {entry.kind === 'directory' ? 'folder' : 'file'} for good?</h4>
        <p className={styles.path}>{entry.path}</p>
        {!verdict && !error ? <p className={styles.muted}>Asking the machine whether it may be deleted…</p> : null}
        {verdict ? (
          <>
            <p>
              {formatBytes(verdict.size_bytes)}
              {verdict.kind === 'directory' ? ` in ${verdict.file_count.toLocaleString()} files` : ''}
              {verdict.drive_used_bytes ? `, ${formatPercent(percentOf(verdict.size_bytes, verdict.drive_used_bytes))} of the ${formatBytes(verdict.drive_used_bytes)} the scan found on the drive` : ''}.
              {' '}Sizes are from the scan of {timeAgo(verdict.scanned_at)}.
            </p>
            {verdict.allowed ? null : <p className={styles.error}>The machine will not delete this: {verdict.refusal_reason}</p>}
            {(verdict.warnings ?? []).map(warning => <p key={warning} className={styles.warning}>{warning}</p>)}
            {verdict.allowed && !result ? (
              <>
                <p className={styles.strong}>
                  This deletes it permanently. It does not go to the Recycle Bin and cannot be undone. Files a program has open are skipped and listed.
                </p>
                <label className={styles.confirmLabel}>
                  Type <code>{verdict.confirmation_name}</code> to confirm
                  <input
                    className={styles.input}
                    value={typed}
                    onChange={event => setTyped(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                  />
                </label>
              </>
            ) : null}
          </>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {result ? <p className={styles.notice}>{result}</p> : null}
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.button} onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {verdict?.allowed && !result ? (
            <button type="button" className={styles.dangerButton} disabled={!confirmed || sending} onClick={() => void submit()}>
              {sending ? 'Starting…' : 'Delete permanently'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** The WSL distributions' disk files: how big each file is on Windows, how
 *  much of it Linux uses, and what compacting would give back. */
type PostAnswer = { ok: boolean; status: number; text: string }

function WSLDisks({ disks, compaction, post, onChanged }: {
  disks: DiskUsageWSLDisk[]
  compaction?: DiskUsageWSLCompaction
  post: (path: string, body: unknown, verb: string) => Promise<PostAnswer>
  onChanged: () => void
}) {
  if (disks.length === 0) return null
  return (
    <section className={styles.wslDisks} aria-label="WSL disks">
      <h5 className={styles.sectionTitle}>WSL disks</h5>
      <table className={styles.recordTable}>
        <thead><tr><th>Distribution</th><th>Disk file on Windows</th><th>Used inside Linux</th><th>Compacting would free</th></tr></thead>
        <tbody>
          {disks.map(disk => {
            const reclaimable = wslDiskReclaimableBytes(disk)
            return (
              <tr key={disk.disk_file_path}>
                <td>{disk.distribution}{disk.runner_runs_in_it ? <span className={styles.muted}> (the runner runs here)</span> : null}</td>
                <td><span title={disk.disk_file_path}>{formatBytes(disk.disk_file_bytes)}</span></td>
                <td>{disk.filesystem_used_bytes ? `${formatBytes(disk.filesystem_used_bytes)} of ${formatBytes(disk.filesystem_total_bytes ?? 0)}` : 'not measured'}</td>
                <td>{reclaimable === null ? '—' : `about ${formatBytes(reclaimable)}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={styles.muted}>
        A WSL disk file grows as Linux writes and never shrinks by itself: space freed inside Linux stays in the file until it is compacted.
      </p>
      {compaction ? <WSLCompaction compaction={compaction} post={post} onChanged={onChanged} /> : null}
    </section>
  )
}

/** Compacting the WSL disk files: set up once through a UAC prompt at the
 *  PC, then a confirmed run that shuts WSL down for a few minutes. */
function WSLCompaction({ compaction, post, onChanged }: {
  compaction: DiskUsageWSLCompaction
  post: (path: string, body: unknown, verb: string) => Promise<PostAnswer>
  onChanged: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const offer = wslCompactionOffer(compaction, new Date())

  const send = async (path: string, body: unknown, verb: string) => {
    setSending(true)
    setError(null)
    const answer = await post(path, body, verb)
    setSending(false)
    if (!answer.ok) {
      setError(diskUsageErrorText(answer.status, answer.text, verb))
      return false
    }
    onChanged()
    return true
  }

  return (
    <div className={styles.compaction}>
      <h5 className={styles.sectionTitle}>Compact</h5>
      {offer.kind === 'set up' ? (
        <>
          <p className={styles.muted}>
            Compacting needs administrator rights, which the runner does not have. Set it up once: the PC shows one UAC prompt, and approving it
            installs a scheduled task that runs a fixed compact script with administrator rights. After that, Compact works from here with no prompt.
            {' '}Not set up: {offer.reason}.
          </p>
          {offer.error ? <p className={styles.error}>The last setup did not finish: {offer.error}</p> : null}
          <div>
            <button type="button" className={styles.button} disabled={sending} onClick={() => void send('/wsl-compaction/set-up', {}, 'set up compacting')}>
              Set up compacting (approve the prompt on the PC)
            </button>
          </div>
        </>
      ) : null}
      {offer.kind === 'waiting on prompt' ? (
        <p className={styles.notice}>A UAC prompt is waiting on the PC's screen (shown {timeAgo(offer.shownAt)}). Approve it there; this page shows when setup is done.</p>
      ) : null}
      {offer.kind === 'running' ? (
        <p className={styles.notice}>Compacting{offer.step ? `: ${offer.step}` : ''}. WSL and the runner are away until it finishes.</p>
      ) : null}
      {offer.kind === 'compact' && !started ? (
        confirming ? (
          <div className={styles.compactConfirm}>
            <p className={styles.strong}>Compacting shuts WSL down on the PC for a few minutes. Until it is back:</p>
            <ul>
              <li>the runner is offline, so this page and every session on the PC stop answering;</li>
              <li>anything running in WSL stops: builds, servers, <code>ssh ssdawn-wsl</code>;</li>
              <li>it is refused while a session on the PC is working.</li>
            </ul>
            <p className={styles.muted}>The script starts WSL again when it is done, and the result shows here once the runner is back.</p>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)} />
              Shut WSL down and compact its disks
            </label>
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.button} onClick={() => { setConfirming(false); setUnderstood(false) }}>Cancel</button>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={!understood || sending}
                onClick={() => void send('/wsl-compaction/runs', { confirm_shutdown: true }, 'compact WSL').then(ok => { if (ok) { setStarted(true); setConfirming(false) } })}
              >
                {sending ? 'Starting…' : 'Compact now'}
              </button>
            </div>
          </div>
        ) : (
          <div><button type="button" className={styles.button} onClick={() => setConfirming(true)}>Compact the WSL disks…</button></div>
        )
      ) : null}
      {started ? <p className={styles.notice}>Compaction started. WSL shuts down in about ten seconds; the runner comes back when it is done.</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {compaction.last_run ? <WSLCompactionRun run={compaction.last_run} /> : null}
    </div>
  )
}

function WSLCompactionRun({ run }: { run: DiskUsageWSLCompactionRun }) {
  const freed = wslCompactionFreedBytes(run)
  return (
    <div className={styles.muted}>
      Last compaction {run.state === 'running' ? 'started' : run.state} {timeAgo(run.started_at)}
      {run.state === 'finished' ? `, freeing ${formatBytes(freed)} on Windows` : ''}.
      {(run.disks ?? []).map(disk => (
        <div key={disk.disk_file_path}>
          {disk.distribution}: {formatBytes(disk.bytes_before)}{disk.compacted ? ` → ${formatBytes(disk.bytes_after ?? 0)}` : ' (not compacted)'}
        </div>
      ))}
      {run.error ? <p className={styles.error}>{run.error}</p> : null}
      {run.state !== 'running' && !run.restarted_wsl ? (
        <p className={styles.error}>The script could not start WSL again. Start it at the PC (open Ubuntu, or sign out and in).</p>
      ) : null}
    </div>
  )
}

function DeletionRecords({ deletions }: { deletions: MachineDiskDeletionRecord[] }) {
  if (deletions.length === 0) return null
  return (
    <details className={styles.records}>
      <summary>Deletions on this machine ({deletions.length} most recent)</summary>
      <table className={styles.recordTable}>
        <thead><tr><th>When</th><th>What</th><th>Outcome</th><th>Freed</th></tr></thead>
        <tbody>
          {deletions.map(record => (
            <tr key={record.id}>
              <td title={new Date(record.requested_at).toLocaleString()}>{timeAgo(record.requested_at)}</td>
              <td className={styles.path}>{record.path}</td>
              <td>
                {deletionStateText(record.state)}
                {record.refusal_reason ? `: ${record.refusal_reason}` : ''}
                {record.failed_entry_count ? `; ${record.failed_entry_count} could not be deleted` : ''}
                {record.errors?.length ? (
                  <details><summary>Errors</summary><ul>{record.errors.map(text => <li key={text}>{text}</li>)}</ul></details>
                ) : null}
              </td>
              <td>{record.state === 'refused' ? '—' : `${formatBytes(record.deleted_bytes)} of ${formatBytes(record.expected_size_bytes)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
