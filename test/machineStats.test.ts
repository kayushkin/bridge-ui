import { describe, expect, it } from 'vitest'
import type { MachineStatsHistoryPoint, MachineStatsOverview, PeerConnection, PeerConnectionView } from '@kayushkin/llm-bridge-types'
import {
  MACHINE_STATS_HISTORY_MAX_POINTS,
  MACHINE_STATS_HISTORY_RANGES,
  batteryTimeText,
  chartRuns,
  driveUsedPercentSeries,
  formatBytes,
  formatDurationSeconds,
  historyDriveMountPoints,
  isUnsetTime,
  machineStatsFreshness,
  machineStatsHistoryPath,
  machineStatsHistoryQuery,
  machineStatsHistoryStepSeconds,
  machineStatsServers,
  machineStatsSourceNote,
  machineUptimeSeconds,
  nearestPointIndex,
  responseMeansNotReported,
  runnerConnectionText,
  usageLevel,
} from '../src/machineStats'
import { loadMachineStatsAnswer } from '../src/useMachineStats'

const NOW = new Date('2026-11-03T12:00:00Z')

describe('history step', () => {
  it('draws one hour from raw minutes', () => {
    expect(machineStatsHistoryStepSeconds(3600)).toBe(60)
  })

  it('keeps every range button between 60 and 600 points', () => {
    for (const range of MACHINE_STATS_HISTORY_RANGES) {
      const points = range.seconds / machineStatsHistoryStepSeconds(range.seconds)
      expect(points, range.key).toBeLessThanOrEqual(MACHINE_STATS_HISTORY_MAX_POINTS)
      expect(points, range.key).toBeGreaterThanOrEqual(60)
    }
    expect(machineStatsHistoryStepSeconds(24 * 3600)).toBe(180)
    expect(machineStatsHistoryStepSeconds(7 * 24 * 3600)).toBe(1200)
    expect(machineStatsHistoryStepSeconds(30 * 24 * 3600)).toBe(5400)
  })

  it('asks for a range ending now, in RFC 3339', () => {
    const query = machineStatsHistoryQuery(MACHINE_STATS_HISTORY_RANGES[0], NOW)
    expect(query).toEqual({ since: '2026-11-03T11:00:00.000Z', until: '2026-11-03T12:00:00.000Z', stepSeconds: 60 })
    expect(machineStatsHistoryPath('m_01 x', query)).toBe(
      '/machines/m_01%20x/stats/history?since=2026-11-03T11%3A00%3A00.000Z&until=2026-11-03T12%3A00%3A00.000Z&step_seconds=60')
  })
})

describe('freshness', () => {
  it('calls a reading within three minutes fresh, older stale, none never reported', () => {
    expect(machineStatsFreshness({ collected_at: '2026-11-03T11:58:30Z' }, NOW)).toBe('fresh')
    expect(machineStatsFreshness({ collected_at: '2026-11-03T11:56:59Z' }, NOW)).toBe('stale')
    expect(machineStatsFreshness(undefined, NOW)).toBe('never reported')
    expect(machineStatsFreshness({ collected_at: '0001-01-01T00:00:00Z' }, NOW)).toBe('never reported')
  })

  it('treats a Go zero time as unset', () => {
    expect(isUnsetTime('0001-01-01T00:00:00Z')).toBe(true)
    expect(isUnsetTime(undefined)).toBe(true)
    expect(isUnsetTime('2026-11-01T08:00:00Z')).toBe(false)
  })

  it('measures uptime from the boot time, else carries the reported uptime forward', () => {
    expect(machineUptimeSeconds({ booted_at: '2026-11-03T10:00:00Z', collected_at: '2026-11-03T11:59:00Z' }, NOW)).toBe(7200)
    expect(machineUptimeSeconds({ booted_at: '0001-01-01T00:00:00Z', uptime_seconds: 100, collected_at: '2026-11-03T11:59:00Z' }, NOW)).toBe(160)
    expect(machineUptimeSeconds({ collected_at: '2026-11-03T11:59:00Z' }, NOW)).toBeNull()
  })
})

describe('words and sizes', () => {
  it('formats bytes in binary units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.50 KiB')
    expect(formatBytes(16 * 1024 ** 3)).toBe('16.0 GiB')
    expect(formatBytes(931.5 * 1024 ** 3)).toBe('932 GiB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.00 TiB')
  })

  it('formats durations in their two largest units', () => {
    expect(formatDurationSeconds(40)).toBe('40 s')
    expect(formatDurationSeconds(12 * 60)).toBe('12 min')
    expect(formatDurationSeconds(5 * 3600 + 12 * 60)).toBe('5 h 12 min')
    expect(formatDurationSeconds(3 * 86400 + 4 * 3600 + 59)).toBe('3 d 4 h')
  })

  it('warns at 85% and calls 95% danger', () => {
    expect(usageLevel(84.9)).toBe('normal')
    expect(usageLevel(85)).toBe('warning')
    expect(usageLevel(95)).toBe('danger')
    expect(usageLevel(null)).toBe('normal')
  })

  it('says when the numbers are the Windows host around WSL', () => {
    expect(machineStatsSourceNote('windows_from_wsl')).toBe('Windows host, read from WSL')
    expect(machineStatsSourceNote('linux')).toBe('')
  })

  it('says what a battery estimate means', () => {
    expect(batteryTimeText({ state: 'discharging', seconds_remaining: 5400 })).toBe('1 h 30 min left')
    expect(batteryTimeText({ state: 'charging', seconds_remaining: 600 })).toBe('10 min to full')
    expect(batteryTimeText({ state: 'full', seconds_remaining: 0 })).toBeNull()
    expect(batteryTimeText({ state: 'discharging' })).toBeNull()
  })

  it('names a runner connection only for runner machines', () => {
    expect(runnerConnectionText({ runner_connected: true })).toBe('runner connected')
    expect(runnerConnectionText({ runner_connected: false })).toBe('runner not connected')
    expect(runnerConnectionText({} as Pick<MachineStatsOverview, 'runner_connected'>)).toBeNull()
  })
})

describe('a server without machine stats', () => {
  it('reads a plain 404 as not reported, and a JSON refusal as an error', () => {
    expect(responseMeansNotReported(404, 'text/plain; charset=utf-8', 'machine not found\n')).toBe(true)
    expect(responseMeansNotReported(404, 'text/plain; charset=utf-8', '404 page not found\n')).toBe(true)
    expect(responseMeansNotReported(404, 'application/json', '{"error":{"code":"peer_connection_not_found","message":"no such connection"}}')).toBe(false)
    expect(responseMeansNotReported(502, 'text/html', 'Bad Gateway')).toBe(false)
  })

  const fakeFetch = (status: number, contentType: string, body: string) =>
    async () => new Response(body, { status, headers: { 'Content-Type': contentType } })

  it('loads a 404 from an old build as an answer', async () => {
    const result = await loadMachineStatsAnswer(fakeFetch(404, 'text/plain', 'machine not found'), '/api/bridge/peer-connections/c1/proxy', '/machines/stats')
    expect(result).toEqual({ ok: true, value: { state: 'not reported' } })
  })

  it('loads a JSON 404 as an error in the server words', async () => {
    const result = await loadMachineStatsAnswer(
      fakeFetch(404, 'application/json', '{"error":{"code":"machine_not_found","message":"no machine m_9"}}'),
      '/api/bridge', '/machines/m_9/stats/history?since=x')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('GET /machines/m_9/stats/history: no machine m_9 (machine_not_found)')
  })

  it('loads a reading', async () => {
    const result = await loadMachineStatsAnswer(fakeFetch(200, 'application/json', '[]'), '/api/bridge', '/machines/stats')
    expect(result).toEqual({ ok: true, value: { state: 'reported', value: [] } })
  })

  it('reports a dropped request as unreachable', async () => {
    const result = await loadMachineStatsAnswer(async () => { throw new TypeError('Failed to fetch') }, '/api/bridge', '/machines/stats')
    expect(result).toEqual({ ok: false, error: 'GET /machines/stats: Failed to fetch', failure: 'unreachable' })
  })
})

describe('servers', () => {
  const connection = (id: string, overrides: Partial<PeerConnection> = {}): PeerConnection => ({
    id, display_name: id, transport: 'direct', role: 'accepting', created_by: 'principal_000001', created_at: '2026-10-27T10:00:00Z', ...overrides,
  })
  const view = (id: string, name: string, overrides: Partial<PeerConnectionView> = {}): PeerConnectionView => ({
    connection: connection(id),
    other_server_name: name,
    access_held: { id: 'peer_access_1', connection_id: id, remote_grant_id: 'g', remote_peer_principal_id: 'p', level_key: 'administrator', created_at: '2026-10-27T10:00:00Z' },
    socket_connected: false,
    ...overrides,
  } as PeerConnectionView)

  it('lists this server first, then connected servers by name, leaving removed ones out', () => {
    const servers = machineStatsServers({ name: 'home' }, [
      view('peer_connection_2', 'zulu'),
      view('peer_connection_1', 'alpha', { access_held: undefined }),
      view('peer_connection_3', 'gone', { connection: connection('peer_connection_3', { removed_at: '2026-10-30T00:00:00Z' }) }),
    ])
    expect(servers.map(server => server.label)).toEqual(['home', 'alpha', 'zulu'])
    expect(servers[0].connectionId).toBeNull()
    expect(servers[1].blockedReason).toContain('has not given this server any access')
    expect(servers[2].blockedReason).toBeNull()
  })
})

describe('charts', () => {
  const at = (minute: number) => Date.parse('2026-11-03T11:00:00Z') + minute * 60_000

  it('breaks a line at a missing value and at a gap of more than two buckets', () => {
    const runs = chartRuns([
      { at: at(0), value: 1 }, { at: at(1), value: 2 },
      { at: at(2), value: null },
      { at: at(3), value: 3 },
      { at: at(7), value: 4 }, { at: at(8), value: 5 },
    ], 60)
    expect(runs.map(run => run.map(point => point.value))).toEqual([[1, 2], [3], [4, 5]])
  })

  it('snaps to the nearest point', () => {
    expect(nearestPointIndex([{ at: 0 }, { at: 100 }, { at: 200 }], 140)).toBe(1)
    expect(nearestPointIndex([], 5)).toBe(-1)
  })

  it('follows each drive by mount point, newest reading first, gaps as null', () => {
    const point = (minute: number, drives: { mount_point: string; used_bytes: number; total_bytes: number }[]): MachineStatsHistoryPoint => ({
      at: new Date(at(minute)).toISOString(),
      sample_count: 1,
      stats: { collected_at: new Date(at(minute)).toISOString(), source: 'linux', drives: drives.map(drive => ({ ...drive, free_bytes: drive.total_bytes - drive.used_bytes })) },
    })
    const points = [
      point(0, [{ mount_point: '/mnt/old', used_bytes: 1, total_bytes: 4 }]),
      point(1, [{ mount_point: '/', used_bytes: 50, total_bytes: 100 }]),
    ]
    expect(historyDriveMountPoints(points)).toEqual(['/', '/mnt/old'])
    expect(driveUsedPercentSeries(points, '/').map(p => p.value)).toEqual([null, 50])
  })
})
