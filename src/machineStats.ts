// Machine health: CPU, memory, drives, batteries and uptime of every machine a
// bridge server knows, read from llm-bridge-server's `GET /machines/stats`
// (the newest reading of each machine) and `GET /machines/{id}/stats/history`
// (bucketed readings over a range). A runner sends a reading every minute and
// the server reads its own machine the same way; the server keeps 30 days.
//
// The Machines page shows this server's machines and, through this server's
// proxy for each connection, every connected server's. A server built before
// these routes answers 404, which the page says in plain words rather than as
// an error.
//
// The pure rules the page draws from; `components/BridgeMachines.tsx` fetches.

import type {
  MachineBattery,
  MachineStats,
  MachineStatsHistoryPoint,
  MachineStatsOverview,
  PeerConnectionView,
  ServerDescription,
} from '@kayushkin/llm-bridge-types'
import { MachineStatsSourceWindowsFromWSL } from '@kayushkin/llm-bridge-types'
import { connectedServerListings, thisServerLabel } from './serverListings'

export const MACHINE_STATS_PATH = '/machines/stats'

/** How often the page reads the newest readings again. */
export const MACHINE_STATS_POLL_MS = 30_000

/** How often an open machine's history is read again. A sample arrives every
 *  minute, so reading faster shows nothing new. */
export const MACHINE_STATS_HISTORY_REFRESH_MS = 60_000

/** A reading older than this means the machine has stopped reporting: three
 *  missed samples at one a minute, so one slow sample is not called stale. */
export const MACHINE_STATS_STALE_AFTER_MS = 3 * 60_000

/** Disk or memory use at or above this is drawn in the warning color. */
export const USAGE_WARNING_PERCENT = 85
/** And at or above this, in the danger color. */
export const USAGE_DANGER_PERCENT = 95

export function machineStatsHistoryPath(machineID: string, query: MachineStatsHistoryQuery): string {
  const params = new URLSearchParams({
    since: query.since,
    until: query.until,
    step_seconds: String(query.stepSeconds),
  })
  return `/machines/${encodeURIComponent(machineID)}/stats/history?${params.toString()}`
}

// ── History ranges ──────────────────────────────────────────────────────────

export interface MachineStatsHistoryRange {
  key: string
  label: string
  seconds: number
}

export const MACHINE_STATS_HISTORY_RANGES: readonly MachineStatsHistoryRange[] = [
  { key: '1h', label: '1 hour', seconds: 3600 },
  { key: '24h', label: '24 hours', seconds: 24 * 3600 },
  { key: '7d', label: '7 days', seconds: 7 * 24 * 3600 },
  { key: '30d', label: '30 days', seconds: 30 * 24 * 3600 },
]

/** The bucket widths a history is asked for in, smallest first. Each divides
 *  an hour or a day evenly, so bucket edges fall on round clock times. The
 *  smallest is the sample interval: a bucket narrower than that is empty. */
export const MACHINE_STATS_HISTORY_STEPS_SECONDS: readonly number[] = [
  60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 5400, 7200, 10800, 21600, 43200, 86400,
]

/** The most points a chart is asked to draw. Past this a line is denser than
 *  the pixels it is drawn on. */
export const MACHINE_STATS_HISTORY_MAX_POINTS = 600

/** The bucket width for a range: the smallest step that keeps the range
 *  within `MACHINE_STATS_HISTORY_MAX_POINTS` buckets. One hour is drawn from
 *  raw minutes (60 points); a day in 3-minute buckets (480); a week in
 *  20-minute buckets (504); 30 days in 90-minute buckets (480). */
export function machineStatsHistoryStepSeconds(rangeSeconds: number): number {
  for (const step of MACHINE_STATS_HISTORY_STEPS_SECONDS) {
    if (rangeSeconds / step <= MACHINE_STATS_HISTORY_MAX_POINTS) return step
  }
  return MACHINE_STATS_HISTORY_STEPS_SECONDS[MACHINE_STATS_HISTORY_STEPS_SECONDS.length - 1]
}

export interface MachineStatsHistoryQuery {
  since: string
  until: string
  stepSeconds: number
}

/** The history request for a range ending now. */
export function machineStatsHistoryQuery(range: MachineStatsHistoryRange, now: Date): MachineStatsHistoryQuery {
  return {
    since: new Date(now.getTime() - range.seconds * 1000).toISOString(),
    until: now.toISOString(),
    stepSeconds: machineStatsHistoryStepSeconds(range.seconds),
  }
}

// ── Times ───────────────────────────────────────────────────────────────────

/** A Go `time.Time` the server left at its zero value, which `omitempty`
 *  does not drop: `0001-01-01T00:00:00Z`. It means "not known". */
export function isUnsetTime(value: string | undefined | null): boolean {
  if (!value) return true
  const ms = Date.parse(value)
  return Number.isNaN(ms) || new Date(ms).getUTCFullYear() <= 1
}

export type MachineStatsFreshness = 'never reported' | 'fresh' | 'stale'

/** Whether a machine's newest reading is recent enough to show as current. */
export function machineStatsFreshness(latest: Pick<MachineStats, 'collected_at'> | null | undefined, now: Date): MachineStatsFreshness {
  if (!latest || isUnsetTime(latest.collected_at)) return 'never reported'
  return now.getTime() - Date.parse(latest.collected_at) > MACHINE_STATS_STALE_AFTER_MS ? 'stale' : 'fresh'
}

/** A length of time in the two largest units: "3 d 4 h", "5 h 12 min",
 *  "12 min", "40 s". */
export function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  if (minutes > 0) return `${minutes} min`
  return `${seconds} s`
}

/** How long the machine has been up now. From `booted_at` when the machine
 *  gave one; else the uptime it reported, carried forward to now. Null when
 *  it gave neither. */
export function machineUptimeSeconds(stats: Pick<MachineStats, 'booted_at' | 'uptime_seconds' | 'collected_at'>, now: Date): number | null {
  if (!isUnsetTime(stats.booted_at)) return (now.getTime() - Date.parse(stats.booted_at!)) / 1000
  if (stats.uptime_seconds) return stats.uptime_seconds + (now.getTime() - Date.parse(stats.collected_at)) / 1000
  return null
}

// ── Sizes and levels ────────────────────────────────────────────────────────

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']

/** Bytes in binary units, three significant digits: "512 B", "1.50 GiB",
 *  "31.4 GiB", "932 GiB". Binary because that is what every OS's own disk and
 *  memory tools mean, whatever letters they print. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  if (unit === 0) return `${value} B`
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`
}

/** Part of a whole as a percent, or null when the whole is unknown. */
export function percentOf(used: number, total: number): number | null {
  if (!total) return null
  return (used / total) * 100
}

export type UsageLevel = 'normal' | 'warning' | 'danger'

export function usageLevel(percent: number | null): UsageLevel {
  if (percent === null) return 'normal'
  if (percent >= USAGE_DANGER_PERCENT) return 'danger'
  if (percent >= USAGE_WARNING_PERCENT) return 'warning'
  return 'normal'
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return '—'
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`
}

// ── Words ───────────────────────────────────────────────────────────────────

/** Where the numbers come from, said when it is not the obvious place: a
 *  runner in WSL reads the Windows machine around it, not its Linux. Empty
 *  for a machine read directly. */
export function machineStatsSourceNote(source: MachineStats['source']): string {
  if (source === MachineStatsSourceWindowsFromWSL) return 'Windows host, read from WSL'
  return ''
}

const BATTERY_STATE_WORDS: Readonly<Record<string, string>> = {
  charging: 'charging',
  discharging: 'on battery',
  full: 'full',
  not_charging: 'plugged in, not charging',
  unknown: 'state unknown',
}

export function batteryStateText(state: MachineBattery['state']): string {
  return BATTERY_STATE_WORDS[state] ?? state
}

/** What the OS's time estimate means for this state, or null when it gave
 *  none: time left on battery, or time until full. */
export function batteryTimeText(battery: Pick<MachineBattery, 'state' | 'seconds_remaining'>): string | null {
  if (battery.seconds_remaining === undefined || battery.seconds_remaining === null) return null
  const duration = formatDurationSeconds(battery.seconds_remaining)
  if (battery.state === 'charging') return `${duration} to full`
  if (battery.state === 'discharging') return `${duration} left`
  return null
}

/** What the page says about a runner machine's connection, or null for a
 *  machine the server reads without a runner. */
export function runnerConnectionText(overview: Pick<MachineStatsOverview, 'runner_connected'>): string | null {
  if (overview.runner_connected === undefined || overview.runner_connected === null) return null
  return overview.runner_connected ? 'runner connected' : 'runner not connected'
}

// ── Answers from a server ───────────────────────────────────────────────────

/** What a server said to `GET /machines/stats`, or to a history read.
 *  `not reported` is a server built before machine stats: it answers 404 with
 *  a plain-text body (its `GET /machines/{id}` handler, or the router's own
 *  "404 page not found"). A 404 that carries the JSON error envelope is a
 *  refusal from a server that knows the route — the proxy's unknown
 *  connection, an unknown machine — and is an error like any other. */
export type MachineStatsAnswer<T> =
  | { state: 'reported'; value: T }
  | { state: 'not reported' }

export function isJSONErrorEnvelope(contentType: string, body: string): boolean {
  if (!contentType.includes('json')) return false
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    return parsed !== null && typeof parsed === 'object' && 'error' in parsed
  } catch {
    return false
  }
}

/** Whether a failed response means "this server does not have machine stats". */
export function responseMeansNotReported(status: number, contentType: string, body: string): boolean {
  return status === 404 && !isJSONErrorEnvelope(contentType, body)
}

export const MACHINE_STATS_NOT_REPORTED_TEXT = 'This server does not report machine stats yet: it runs a build from before they were added.'

// ── Servers ─────────────────────────────────────────────────────────────────

export interface MachineStatsServer {
  /** Stable React key and poll key: the connection id, or `this-server`. */
  key: string
  /** The connection this server is reached by; null for this server. */
  connectionId: string | null
  label: string
  /** Why it cannot be read now, or null when it can. */
  blockedReason: string | null
}

/** This server first, then every connected server that is not removed, by
 *  name. One that cannot be read now stays listed, saying why, so a server
 *  that went offline does not silently vanish from the page. */
export function machineStatsServers(
  thisServer: Pick<ServerDescription, 'name'> | null,
  views: readonly PeerConnectionView[],
): MachineStatsServer[] {
  const removed = new Set(views.filter(view => view.connection.removed_at).map(view => view.connection.id))
  const connected = connectedServerListings(views)
    .filter(listing => !removed.has(listing.connectionId))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(listing => ({
      key: listing.connectionId,
      connectionId: listing.connectionId,
      label: listing.label,
      blockedReason: listing.blockedReason,
    }))
  return [
    { key: 'this-server', connectionId: null, label: thisServerLabel(thisServer?.name), blockedReason: null },
    ...connected,
  ]
}

// ── Charts ──────────────────────────────────────────────────────────────────

/** One point of a chart: when (ms since the epoch) and the value, null where
 *  the reading has none. */
export interface ChartPoint {
  at: number
  value: number | null
}

/** The runs of a series to draw as unbroken lines. A run breaks at a null
 *  value and where two neighboring points are more than two buckets apart,
 *  because the machine sent nothing in between and a line across the gap
 *  would claim it did. */
export function chartRuns(points: readonly ChartPoint[], stepSeconds: number): { at: number; value: number }[][] {
  const runs: { at: number; value: number }[][] = []
  let current: { at: number; value: number }[] = []
  let previousAt: number | null = null
  for (const point of points) {
    const gap = previousAt !== null && point.at - previousAt > 2 * stepSeconds * 1000
    if (point.value === null || gap) {
      if (current.length) runs.push(current)
      current = []
    }
    if (point.value !== null) current.push({ at: point.at, value: point.value })
    previousAt = point.at
  }
  if (current.length) runs.push(current)
  return runs
}

/** The index of the point nearest a time, or -1 for no points. */
export function nearestPointIndex(points: readonly { at: number }[], at: number): number {
  let best = -1
  let bestDistance = Infinity
  for (let i = 0; i < points.length; i++) {
    const distance = Math.abs(points[i].at - at)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/** A time on a chart's axis or readout, in the viewer's own zone: the clock
 *  time alone for a range of a day or less, the date as well for longer. */
export function formatChartTime(at: number, rangeSeconds: number): string {
  const date = new Date(at)
  if (rangeSeconds <= 24 * 3600) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** The drives a machine's history covers, by mount point, in the order of the
 *  newest reading, then any that only older readings had. */
export function historyDriveMountPoints(points: readonly MachineStatsHistoryPoint[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (let i = points.length - 1; i >= 0; i--) {
    for (const drive of points[i].stats.drives ?? []) {
      if (!seen.has(drive.mount_point)) {
        seen.add(drive.mount_point)
        order.push(drive.mount_point)
      }
    }
  }
  return order
}

/** The batteries a machine's history covers, by name, newest reading first. */
export function historyBatteryNames(points: readonly MachineStatsHistoryPoint[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (let i = points.length - 1; i >= 0; i--) {
    for (const battery of points[i].stats.batteries ?? []) {
      if (!seen.has(battery.name)) {
        seen.add(battery.name)
        order.push(battery.name)
      }
    }
  }
  return order
}

export function pointTime(point: MachineStatsHistoryPoint): number {
  return Date.parse(point.at)
}

/** One drive's used share at each point, null where that reading lacks it. */
export function driveUsedPercentSeries(points: readonly MachineStatsHistoryPoint[], mountPoint: string): ChartPoint[] {
  return points.map(point => {
    const drive = point.stats.drives?.find(candidate => candidate.mount_point === mountPoint)
    return { at: pointTime(point), value: drive ? percentOf(drive.used_bytes, drive.total_bytes) : null }
  })
}

export function batteryChargeSeries(points: readonly MachineStatsHistoryPoint[], name: string): ChartPoint[] {
  return points.map(point => {
    const battery = point.stats.batteries?.find(candidate => candidate.name === name)
    return { at: pointTime(point), value: battery ? battery.charge_percent : null }
  })
}

export function memoryUsedSeries(points: readonly MachineStatsHistoryPoint[]): ChartPoint[] {
  return points.map(point => ({ at: pointTime(point), value: point.stats.memory_total_bytes ? point.stats.memory_used_bytes ?? 0 : null }))
}

export function swapUsedSeries(points: readonly MachineStatsHistoryPoint[]): ChartPoint[] {
  return points.map(point => ({ at: pointTime(point), value: point.stats.swap_total_bytes ? point.stats.swap_used_bytes ?? 0 : null }))
}

export function cpuAverageSeries(points: readonly MachineStatsHistoryPoint[]): ChartPoint[] {
  return points.map(point => ({ at: pointTime(point), value: point.cpu_usage_percent_average ?? null }))
}

export function cpuMaximumSeries(points: readonly MachineStatsHistoryPoint[]): ChartPoint[] {
  return points.map(point => ({ at: pointTime(point), value: point.cpu_usage_percent_maximum ?? null }))
}

/** The largest total a series of readings reported, for the top of a byte
 *  axis: memory or swap can grow while the range is drawn. */
export function largestTotal(points: readonly MachineStatsHistoryPoint[], total: (stats: MachineStats) => number | undefined): number {
  let largest = 0
  for (const point of points) largest = Math.max(largest, total(point.stats) ?? 0)
  return largest
}
