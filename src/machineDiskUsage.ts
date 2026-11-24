// Disk usage on the Machines page: what fills a runner machine's drives and
// deleting what its owner picks, from llm-bridge-server's
// `/machines/{id}/disk-usage` routes (llm-bridge `msg/disk_usage.go`).
//
// The pure rules the panel draws from; `components/machines/MachineDiskUsage.tsx`
// fetches and draws.

import type {
  DiskUsageDeletion,
  DiskUsageDeletionCheck,
  DiskUsageDeletionState,
  DiskUsageEntry,
  DiskUsageScan,
  DiskUsageStatus,
  DiskUsageTool,
} from '@kayushkin/llm-bridge-types'

/** What `GET /machines/{id}/disk-usage` answers. */
export interface MachineDiskUsageView {
  machine_id: string
  available: boolean
  unavailable_reason?: string
  helper?: DiskUsageTool
  status?: DiskUsageStatus
  deletions: MachineDiskDeletionRecord[]
}

/** One recorded deletion (llm-bridge-server's table machine_disk_deletions). */
export interface MachineDiskDeletionRecord {
  id: string
  machine_id: string
  path: string
  kind: string
  expected_size_bytes: number
  requested_by_principal_id?: string
  requested_at: string
  state: DiskUsageDeletionState
  finished_at?: string
  deleted_bytes: number
  deleted_file_count: number
  failed_entry_count: number
  errors?: string[]
  refusal_reason?: string
}

/** What `POST /machines/{id}/disk-usage/deletions` answers on 202 and on a refusal. */
export interface MachineDiskDeletionAnswer {
  deletion: MachineDiskDeletionRecord
  deletion_check?: DiskUsageDeletionCheck
}

export const diskUsagePath = (machineID: string) => `/machines/${encodeURIComponent(machineID)}/disk-usage`
export const diskUsageEntriesPath = (machineID: string, path: string) =>
  `${diskUsagePath(machineID)}/entries?${new URLSearchParams({ path }).toString()}`

/** How often the panel reads the runner's status: often while a scan or a
 *  deletion runs, so its progress moves, and slowly otherwise. */
export const DISK_USAGE_BUSY_POLL_MS = 2_000
export const DISK_USAGE_IDLE_POLL_MS = 20_000

export function diskUsageIsBusy(status: DiskUsageStatus | undefined): boolean {
  if (!status) return false
  return status.scans.some(scan => scan.state === 'running') || status.deletion?.state === 'running'
}

/** A drive root's path, as the runner names it: `C:` → `C:\`. */
export const driveRootPath = (drive: string) => `${drive}\\`

/** The entry's share of its parent, 0–100. */
export function shareOfParent(entry: DiskUsageEntry, parentSizeBytes: number): number {
  if (parentSizeBytes <= 0) return 0
  return Math.min(100, (entry.size_bytes / parentSizeBytes) * 100)
}

/** Whether the panel offers to delete the entry. The root of a drive, a link
 *  and the rolled-up smaller items never are; the runner and the helper
 *  decide the rest, and the dialog shows their answer before anything is
 *  deleted. */
export function entryOffersDeletion(entry: DiskUsageEntry, isDriveRoot: boolean): boolean {
  if (isDriveRoot) return false
  return entry.kind === 'file' || entry.kind === 'directory'
}

/** Whether what the owner typed confirms deleting the entry: exactly its
 *  name, as the server also requires. */
export function confirmationMatches(typed: string, confirmationName: string): boolean {
  return confirmationName !== '' && typed === confirmationName
}

export function entryDisplayName(entry: DiskUsageEntry): string {
  if (entry.kind === 'smaller_items') {
    const count = entry.item_count ?? 0
    return `${count.toLocaleString()} smaller ${count === 1 ? 'item' : 'items'}`
  }
  return entry.name
}

/** "1,204 files in 37 folders" for a folder; "" for a file. */
export function entryContentsText(entry: DiskUsageEntry): string {
  if (entry.kind === 'file' || entry.kind === 'link') return ''
  const files = `${entry.file_count.toLocaleString()} ${entry.file_count === 1 ? 'file' : 'files'}`
  if (!entry.directory_count) return files
  return `${files} in ${entry.directory_count.toLocaleString()} ${entry.directory_count === 1 ? 'folder' : 'folders'}`
}

const DELETION_STATE_TEXT: Record<DiskUsageDeletionState, string> = {
  requested: 'asked for',
  refused: 'refused, nothing deleted',
  running: 'deleting',
  completed: 'deleted',
  partial: 'partly deleted',
  failed: 'failed',
  lost: 'outcome unknown (the runner went away); scan again to see',
}

export function deletionStateText(state: DiskUsageDeletionState): string {
  return DELETION_STATE_TEXT[state] ?? state
}

/** The drive's latest scan, or undefined when it has none. */
export function scanOfDrive(status: DiskUsageStatus | undefined, drive: string): DiskUsageScan | undefined {
  return status?.scans.find(scan => scan.drive === drive)
}

/** When the tree the panel can browse for this drive was scanned, or null
 *  when there is none to browse. A running or failed rescan leaves the
 *  previous tree browsable. */
export function browsableScanTime(scan: DiskUsageScan | undefined): string | null {
  if (!scan) return null
  if (scan.state === 'finished' && scan.finished_at) return scan.finished_at
  return scan.previous_finished_at ?? null
}

/** A deletion is reported once, when the runner's status shows it ended. */
export function deletionEnded(deletion: DiskUsageDeletion | undefined): boolean {
  return !!deletion && deletion.state !== 'running'
}

/** The words of a refusal from these routes: the server's
 *  `{"error":{"code","message"}}` message, a plain `{"error":"…"}`, the raw
 *  body, or the status when there is no body. */
export function diskUsageErrorText(status: number, body: string, verb: string): string {
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: unknown }
      const error = parsed?.error
      if (typeof error === 'string' && error) return error
      if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message
      }
    } catch {
      // Not JSON; the raw text is the message.
    }
    return body.trim()
  }
  return `${verb}: HTTP ${status}`
}
