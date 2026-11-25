import { describe, expect, it } from 'vitest'
import type { DiskUsageEntry, DiskUsageScan, DiskUsageStatus } from '@kayushkin/llm-bridge-types'
import {
  browsableScanTime,
  confirmationMatches,
  diskUsageEntriesPath,
  diskUsageErrorText,
  diskUsageIsBusy,
  driveButtonName,
  entryContentsText,
  entryDisplayName,
  entryOffersDeletion,
  shareOfParent,
  wslCompactionFreedBytes,
  wslCompactionOffer,
  wslDiskReclaimableBytes,
} from '../src/machineDiskUsage'

const entry = (fields: Partial<DiskUsageEntry>): DiskUsageEntry => ({
  name: 'Games', path: 'D:\\Games', kind: 'directory', size_bytes: 500, file_count: 12, directory_count: 3, ...fields,
})

describe('disk usage rules', () => {
  it('offers to delete files and folders, never a drive root, a link or the smaller items', () => {
    expect(entryOffersDeletion(entry({}), false)).toBe(true)
    expect(entryOffersDeletion(entry({ kind: 'file' }), false)).toBe(true)
    expect(entryOffersDeletion(entry({}), true)).toBe(false)
    expect(entryOffersDeletion(entry({ kind: 'link' }), false)).toBe(false)
    expect(entryOffersDeletion(entry({ kind: 'smaller_items', path: '' }), false)).toBe(false)
  })

  it('confirms only on exactly the name', () => {
    expect(confirmationMatches('Old Game', 'Old Game')).toBe(true)
    expect(confirmationMatches('old game', 'Old Game')).toBe(false)
    expect(confirmationMatches('Old Game ', 'Old Game')).toBe(false)
    expect(confirmationMatches('', '')).toBe(false)
  })

  it('reads the server refusal envelope, a plain error, raw text and a bodiless status', () => {
    expect(diskUsageErrorText(409, '{"error":{"code":"runner_refused","message":"C: is busy"}}', 'x')).toBe('C: is busy')
    expect(diskUsageErrorText(400, '{"error":"bad"}', 'x')).toBe('bad')
    expect(diskUsageErrorText(502, 'gateway down\n', 'x')).toBe('gateway down')
    expect(diskUsageErrorText(500, '', 'delete')).toBe('delete: HTTP 500')
  })

  it('polls quickly only while a scan or deletion runs', () => {
    const scan = (state: DiskUsageScan['state']): DiskUsageScan => ({ drive: 'C:', state, started_at: '2026-11-24T20:00:00Z', scanned_entry_count: 0, scanned_bytes: 0 })
    const status = (scans: DiskUsageScan[], deletionState?: 'running' | 'completed'): DiskUsageStatus => ({
      drives: [], scans,
      deletion: deletionState ? { deletion_id: 'machine_disk_deletion_000001', path: 'D:\\x', kind: 'file', state: deletionState, started_at: '', expected_size_bytes: 0, deleted_bytes: 0, deleted_file_count: 0, failed_entry_count: 0 } : undefined,
    })
    expect(diskUsageIsBusy(undefined)).toBe(false)
    expect(diskUsageIsBusy(status([scan('finished')]))).toBe(false)
    expect(diskUsageIsBusy(status([scan('running')]))).toBe(true)
    expect(diskUsageIsBusy(status([], 'running'))).toBe(true)
    expect(diskUsageIsBusy(status([], 'completed'))).toBe(false)
  })

  it('keeps the previous tree browsable while a rescan runs or after one fails', () => {
    const base = { drive: 'C:', started_at: '2026-11-24T20:00:00Z', scanned_entry_count: 0, scanned_bytes: 0 }
    expect(browsableScanTime(undefined)).toBeNull()
    expect(browsableScanTime({ ...base, state: 'running' })).toBeNull()
    expect(browsableScanTime({ ...base, state: 'running', previous_finished_at: '2026-11-24T19:00:00Z' })).toBe('2026-11-24T19:00:00Z')
    expect(browsableScanTime({ ...base, state: 'finished', finished_at: '2026-11-24T20:02:00Z' })).toBe('2026-11-24T20:02:00Z')
    expect(browsableScanTime({ ...base, state: 'failed', previous_finished_at: '2026-11-24T19:00:00Z' })).toBe('2026-11-24T19:00:00Z')
  })

  it('names and measures entries', () => {
    expect(entryDisplayName(entry({ kind: 'smaller_items', item_count: 1 }))).toBe('1 smaller item')
    expect(entryDisplayName(entry({ kind: 'smaller_items', item_count: 4200 }))).toBe('4,200 smaller items')
    expect(entryContentsText(entry({}))).toBe('12 files in 3 folders')
    expect(entryContentsText(entry({ file_count: 1, directory_count: 0 }))).toBe('1 file')
    expect(entryContentsText(entry({ kind: 'file' }))).toBe('')
    expect(shareOfParent(entry({ size_bytes: 250 }), 1000)).toBe(25)
    expect(shareOfParent(entry({}), 0)).toBe(0)
    expect(diskUsageEntriesPath('m_pc', 'C:\\Program Files')).toBe('/machines/m_pc/disk-usage/entries?path=C%3A%5CProgram+Files')
  })

  it('names drives and says what compacting a WSL disk would give back', () => {
    expect(driveButtonName({ drive: 'C:', kind: 'windows', root_path: 'C:\\', label: 'Data', total_bytes: 1, free_bytes: 0 })).toBe('C: Data')
    expect(driveButtonName({ drive: 'D:', kind: 'windows', root_path: 'D:\\', total_bytes: 1, free_bytes: 0 })).toBe('D:')
    expect(driveButtonName({ drive: 'WSL', kind: 'wsl', root_path: '/', label: 'Ubuntu-22.04 (WSL)', total_bytes: 1, free_bytes: 0 })).toBe('Ubuntu-22.04 (WSL)')
    const disk = { distribution: 'Ubuntu-22.04', disk_file_path: 'C:\\x\\ext4.vhdx', disk_file_bytes: 1000 }
    expect(wslDiskReclaimableBytes({ ...disk, runner_runs_in_it: true, filesystem_used_bytes: 600, filesystem_total_bytes: 2000 })).toBe(400)
    expect(wslDiskReclaimableBytes({ ...disk, runner_runs_in_it: true, filesystem_used_bytes: 1200 })).toBe(0)
    expect(wslDiskReclaimableBytes(disk)).toBeNull()
  })

  it('offers to set compaction up, waits on the prompt, then offers to compact', () => {
    const now = new Date('2026-11-25T18:00:00Z')
    expect(wslCompactionOffer({ set_up: false, not_set_up_reason: 'the compact script is not installed' }, now))
      .toEqual({ kind: 'set up', reason: 'the compact script is not installed', error: undefined })
    expect(wslCompactionOffer({ set_up: false, set_up_prompt_shown_at: '2026-11-25T17:58:00Z' }, now))
      .toEqual({ kind: 'waiting on prompt', shownAt: '2026-11-25T17:58:00Z' })
    expect(wslCompactionOffer({ set_up: false, set_up_prompt_shown_at: '2026-11-25T17:30:00Z', not_set_up_reason: 'x' }, now).kind).toBe('set up')
    expect(wslCompactionOffer({ set_up: false, set_up_prompt_shown_at: '2026-11-25T17:58:00Z', set_up_error: 'the UAC prompt was declined at the PC', not_set_up_reason: 'x' }, now))
      .toEqual({ kind: 'set up', reason: 'x', error: 'the UAC prompt was declined at the PC' })
    expect(wslCompactionOffer({ set_up: true }, now)).toEqual({ kind: 'compact' })
    expect(wslCompactionOffer({ set_up: true, last_run: { state: 'running', step: 'compacting Ubuntu-22.04', started_at: '2026-11-25T17:59:00Z', restarted_wsl: false } }, now))
      .toEqual({ kind: 'running', step: 'compacting Ubuntu-22.04' })
  })

  it('counts what a compaction freed over the disks it compacted', () => {
    expect(wslCompactionFreedBytes({
      state: 'finished', started_at: '', restarted_wsl: true,
      disks: [
        { distribution: 'a', disk_file_path: 'A', bytes_before: 1000, bytes_after: 600, compacted: true },
        { distribution: 'b', disk_file_path: 'B', bytes_before: 500, compacted: false },
      ],
    })).toBe(400)
  })
})
