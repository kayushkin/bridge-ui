import { useEffect, useMemo, useState } from 'react'
import type {
  MachineBattery,
  MachineDrive,
  MachineStats,
  MachineStatsHistory,
  MachineStatsOverview,
} from '@kayushkin/llm-bridge-types'
import { useBridgeConfig, type BridgeConfig } from '../../context'
import {
  MACHINE_STATS_HISTORY_RANGES,
  MACHINE_STATS_NOT_REPORTED_TEXT,
  batteryChargeSeries,
  batteryStateText,
  batteryTimeText,
  cpuAverageSeries,
  cpuMaximumSeries,
  driveUsedPercentSeries,
  formatBytes,
  formatChartTime,
  formatDurationSeconds,
  formatPercent,
  historyBatteryNames,
  historyDriveMountPoints,
  isUnsetTime,
  largestTotal,
  machineStatsFreshness,
  machineStatsSourceNote,
  machineUptimeSeconds,
  memoryUsedSeries,
  percentOf,
  runnerConnectionText,
  swapUsedSeries,
  usageLevel,
  type MachineStatsHistoryRange,
  type MachineStatsServer,
  type UsageLevel,
} from '../../machineStats'
import {
  machineStatsServerConfig,
  useMachineStatsHistory,
  useMachineStatsOverview,
  useMachineStatsServers,
} from '../../useMachineStats'
import { timeAgo } from '../../utils'
import { MachineStatsChart } from './MachineStatsChart'
import styles from './BridgeMachines.module.css'

/**
 * The Machines page: the health of every machine this server knows and every
 * machine each connected server knows — CPU, memory, swap, drives, batteries,
 * uptime and OS — from llm-bridge-server's `GET /machines/stats`, read every
 * 30 seconds, with each machine's history from
 * `GET /machines/{id}/stats/history` when its card is opened.
 *
 * A section per server, this one first. A connected server is read through
 * this server's proxy for the connection. One that cannot be read now says
 * why; one built before machine stats says that, not an error.
 */
export function BridgeMachines() {
  const config = useBridgeConfig()
  const { servers, error } = useMachineStatsServers(config)
  // Re-render once a minute so "last reported" and uptime keep moving between polls.
  const now = useMinuteClock()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>Machines</h2>
        <p className={styles.subtitle}>
          Each machine sends a reading every minute; the server keeps 30 days. Times are in this browser's time zone.
          Open a machine for its history.
        </p>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {servers.map(server => <ServerSection key={server.key} server={server} config={config} now={now} />)}
    </div>
  )
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function ServerSection({ server, config, now }: { server: MachineStatsServer; config: BridgeConfig; now: Date }) {
  return (
    <section className={styles.server} aria-label={server.label}>
      <h3 className={styles.serverHeading}>
        {server.label}
        {server.connectionId === null ? <span className={styles.chip}>this server</span> : <span className={styles.chip}>connected server</span>}
      </h3>
      {server.blockedReason
        ? <p className={styles.notice}>{server.blockedReason}</p>
        : <ServerMachines server={server} config={config} now={now} />}
    </section>
  )
}

function ServerMachines({ server, config, now }: { server: MachineStatsServer; config: BridgeConfig; now: Date }) {
  const serverConfig = useMemo(() => machineStatsServerConfig(config, server), [config, server.connectionId])
  const overview = useMachineStatsOverview(serverConfig)
  const [openMachineID, setOpenMachineID] = useState<string | null>(null)

  if (overview.loading && !overview.data) return <p className={styles.muted}>Loading…</p>
  const answer = overview.data
  return (
    <>
      {overview.error ? <p className={styles.error}>{overview.error}</p> : null}
      {answer?.state === 'not reported' ? <p className={styles.notice}>{MACHINE_STATS_NOT_REPORTED_TEXT}</p> : null}
      {answer?.state === 'reported' && answer.value.length === 0 ? <p className={styles.muted}>This server has no machines.</p> : null}
      {answer?.state === 'reported' && answer.value.length > 0 ? (
        <div className={styles.cards}>
          {answer.value.map(entry => (
            <MachineCard
              key={entry.machine.id}
              overview={entry}
              now={now}
              open={openMachineID === entry.machine.id}
              onToggle={() => setOpenMachineID(current => current === entry.machine.id ? null : entry.machine.id)}
              serverConfig={serverConfig}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

const LEVEL_CLASS: Record<UsageLevel, string> = {
  normal: styles.meterNormal,
  warning: styles.meterWarning,
  danger: styles.meterDanger,
}

/** Said beside a share that reached a threshold, so the level is not told by
 *  color alone. */
const LEVEL_WORD: Record<UsageLevel, string> = {
  normal: '',
  warning: 'high',
  danger: 'critical',
}

const LEVEL_WORD_CLASS: Record<UsageLevel, string> = {
  normal: '',
  warning: styles.levelWarning,
  danger: styles.levelDanger,
}

function Meter({ percent, label }: { percent: number | null; label: string }) {
  const level = usageLevel(percent)
  return (
    <div className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
      <div className={`${styles.meterFill} ${LEVEL_CLASS[level]}`} style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
    </div>
  )
}

function LevelWord({ percent }: { percent: number | null }) {
  const word = LEVEL_WORD[usageLevel(percent)]
  return word ? <span className={`${styles.levelWord} ${LEVEL_WORD_CLASS[usageLevel(percent)]}`}>{word}</span> : null
}

export function MachineCard({ overview, now, open, onToggle, serverConfig }: {
  overview: MachineStatsOverview
  now: Date
  open: boolean
  onToggle: () => void
  serverConfig: BridgeConfig
}) {
  const { machine, latest } = overview
  const freshness = machineStatsFreshness(latest, now)
  const runnerText = runnerConnectionText(overview)
  const historyID = `machine-history-${machine.id}`

  return (
    <article className={`${styles.card} ${freshness !== 'fresh' ? styles.cardStale : ''} ${open ? styles.cardOpen : ''}`}>
      <header className={styles.cardHeader}>
        <h4 className={styles.cardTitle}>
          {machine.emoji ? <span aria-hidden="true">{machine.emoji} </span> : null}{machine.name}
        </h4>
        <FreshnessPill freshness={freshness} collectedAt={latest?.collected_at} />
        {runnerText ? <span className={styles.chip}>{runnerText}</span> : null}
        <button type="button" className={styles.button} aria-expanded={open} aria-controls={historyID} onClick={onToggle}>
          {open ? 'Hide history' : 'History'}
        </button>
      </header>
      {latest ? <MachineReading stats={latest} now={now} fresh={freshness === 'fresh'} /> : <p className={styles.muted}>This machine has never sent a reading.</p>}
      {open ? (
        <div id={historyID} className={styles.history}>
          <MachineHistory serverConfig={serverConfig} machineID={machine.id} />
        </div>
      ) : null}
    </article>
  )
}

function FreshnessPill({ freshness, collectedAt }: { freshness: ReturnType<typeof machineStatsFreshness>; collectedAt: string | undefined }) {
  if (freshness === 'never reported') return <span className={`${styles.pill} ${styles.pillStale}`}>not reporting</span>
  const when = new Date(collectedAt!).toLocaleString()
  if (freshness === 'stale') {
    return <span className={`${styles.pill} ${styles.pillStale}`} title={when}>stale · last reported {timeAgo(collectedAt!)} ({when})</span>
  }
  return <span className={`${styles.pill} ${styles.pillFresh}`} title={when}>reporting</span>
}

export function MachineReading({ stats, now, fresh }: { stats: MachineStats; now: Date; fresh: boolean }) {
  const sourceNote = machineStatsSourceNote(stats.source)
  // A machine that stopped reporting may be down, so its uptime is given as
  // of its last reading rather than carried on to now.
  const uptime = machineUptimeSeconds(stats, fresh ? now : new Date(stats.collected_at))
  const memoryPercent = percentOf(stats.memory_used_bytes ?? 0, stats.memory_total_bytes ?? 0)
  const swapPercent = percentOf(stats.swap_used_bytes ?? 0, stats.swap_total_bytes ?? 0)

  return (
    <div className={styles.reading}>
      <p className={styles.facts}>
        {stats.operating_system ? <span>{stats.operating_system}</span> : null}
        {stats.kernel_version ? <span className={styles.muted}>kernel {stats.kernel_version}</span> : null}
        {stats.hostname ? <span className={styles.muted}>{stats.hostname}</span> : null}
        {sourceNote ? <span className={styles.chip}>{sourceNote}</span> : null}
      </p>
      <p className={styles.facts}>
        {uptime === null
          ? <span className={styles.muted}>uptime not reported</span>
          : <span>{fresh ? 'Up' : 'Was up'} {formatDurationSeconds(uptime)}{fresh ? '' : ' at its last reading'}</span>}
        {!isUnsetTime(stats.booted_at) ? <span className={styles.muted}>last reboot {new Date(stats.booted_at!).toLocaleString()}</span> : null}
      </p>

      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.rowLabel}>CPU</span>
          <span className={styles.rowValue}>{formatPercent(stats.cpu_usage_percent)}</span>
          <LevelWord percent={stats.cpu_usage_percent ?? null} />
        </div>
        <Meter percent={stats.cpu_usage_percent ?? null} label="CPU in use" />
        <div className={styles.rowDetail}>
          {stats.cpu_model ? <span>{stats.cpu_model}</span> : null}
          {stats.cpu_logical_cores ? <span>{stats.cpu_logical_cores} logical cores</span> : null}
          {stats.load_average?.length ? <span>load {stats.load_average.map(load => load.toFixed(2)).join(' · ')}</span> : null}
        </div>
      </div>

      {stats.memory_total_bytes ? (
        <div className={styles.row}>
          <div className={styles.rowHead}>
            <span className={styles.rowLabel}>Memory</span>
            <span className={styles.rowValue}>{formatBytes(stats.memory_used_bytes ?? 0)} of {formatBytes(stats.memory_total_bytes)}</span>
            <span className={styles.muted}>{formatPercent(memoryPercent)}</span>
            <LevelWord percent={memoryPercent} />
          </div>
          <Meter percent={memoryPercent} label="Memory in use" />
          {stats.memory_available_bytes !== undefined ? <div className={styles.rowDetail}><span>{formatBytes(stats.memory_available_bytes)} available</span></div> : null}
        </div>
      ) : null}

      {stats.swap_total_bytes ? (
        <div className={styles.row}>
          <div className={styles.rowHead}>
            <span className={styles.rowLabel}>Swap</span>
            <span className={styles.rowValue}>{formatBytes(stats.swap_used_bytes ?? 0)} of {formatBytes(stats.swap_total_bytes)}</span>
            <span className={styles.muted}>{formatPercent(swapPercent)}</span>
            <LevelWord percent={swapPercent} />
          </div>
          <Meter percent={swapPercent} label="Swap in use" />
        </div>
      ) : null}

      {(stats.drives ?? []).map(drive => <DriveRow key={drive.mount_point} drive={drive} />)}
      {(stats.batteries ?? []).map(battery => <BatteryRow key={battery.name} battery={battery} />)}

      {stats.collection_errors?.length ? (
        <div className={styles.collectionErrors}>
          <span>Could not read:</span>
          <ul>{stats.collection_errors.map(text => <li key={text}>{text}</li>)}</ul>
        </div>
      ) : null}
    </div>
  )
}

function DriveRow({ drive }: { drive: MachineDrive }) {
  const percent = percentOf(drive.used_bytes, drive.total_bytes)
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowLabel} title={drive.device}>
          {drive.mount_point}{drive.label ? <span className={styles.muted}> {drive.label}</span> : null}
        </span>
        <span className={styles.rowValue}>{formatBytes(drive.used_bytes)} of {formatBytes(drive.total_bytes)}</span>
        <span className={styles.muted}>{formatPercent(percent)}</span>
        <LevelWord percent={percent} />
      </div>
      <Meter percent={percent} label={`${drive.mount_point} in use`} />
      <div className={styles.rowDetail}>
        <span>{formatBytes(drive.free_bytes)} free</span>
        {drive.filesystem_type ? <span>{drive.filesystem_type}</span> : null}
        {drive.device ? <span>{drive.device}</span> : null}
      </div>
    </div>
  )
}

function BatteryRow({ battery }: { battery: MachineBattery }) {
  const time = batteryTimeText(battery)
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowLabel}>Battery {battery.name}</span>
        <span className={styles.rowValue}>{formatPercent(battery.charge_percent)}</span>
        <span className={styles.muted}>{batteryStateText(battery.state)}</span>
      </div>
      <div className={styles.meter} role="meter" aria-label={`Battery ${battery.name} charge`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery.charge_percent}>
        <div className={`${styles.meterFill} ${styles.meterNormal}`} style={{ width: `${Math.min(100, Math.max(0, battery.charge_percent))}%` }} />
      </div>
      <div className={styles.rowDetail}>
        {time ? <span>{time}</span> : null}
        {battery.health_percent !== undefined ? <span>health {formatPercent(battery.health_percent)} of design capacity</span> : null}
        {battery.cycle_count !== undefined ? <span>{battery.cycle_count} cycles</span> : null}
      </div>
    </div>
  )
}

function MachineHistory({ serverConfig, machineID }: { serverConfig: BridgeConfig; machineID: string }) {
  const [range, setRange] = useState<MachineStatsHistoryRange>(MACHINE_STATS_HISTORY_RANGES[1])
  const { answer, loading, error } = useMachineStatsHistory(serverConfig, machineID, range)

  return (
    <div className={styles.historyBody}>
      <div className={styles.rangeRow} role="group" aria-label="History range">
        {MACHINE_STATS_HISTORY_RANGES.map(option => (
          <button
            key={option.key}
            type="button"
            className={`${styles.button} ${option.key === range.key ? styles.buttonSelected : ''}`}
            aria-pressed={option.key === range.key}
            onClick={() => setRange(option)}
          >
            {option.label}
          </button>
        ))}
        {loading ? <span className={styles.muted}>Loading…</span> : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {answer?.state === 'not reported' ? <p className={styles.notice}>{MACHINE_STATS_NOT_REPORTED_TEXT}</p> : null}
      {answer?.state === 'reported' ? (
        <div className={loading ? styles.historyRefreshing : undefined}>
          <HistoryCharts history={answer.value} />
        </div>
      ) : null}
    </div>
  )
}

const formatChartPercent = (value: number) => `${Math.round(value)}%`

/** Every chart of one machine's history, on one time axis. */
export function HistoryCharts({ history }: { history: MachineStatsHistory }) {
  const points = history.points ?? []
  const since = Date.parse(history.since)
  const until = Date.parse(history.until)
  const step = history.step_seconds
  if (points.length === 0) return <p className={styles.muted}>No readings in this range.</p>

  // Memory and swap are drawn against their total, so a full axis means full.
  const memoryTotal = largestTotal(points, stats => stats.memory_total_bytes)
  const swapTotal = largestTotal(points, stats => stats.swap_total_bytes)
  const common = { since, until, stepSeconds: step }

  return (
    <>
      <div className={styles.charts}>
        <MachineStatsChart
          title="CPU in use"
          points={cpuAverageSeries(points)}
          bandTops={cpuMaximumSeries(points)}
          lineName="average"
          bandName="peak"
          yMaximum={100}
          formatValue={formatChartPercent}
          {...common}
        />
        <MachineStatsChart title="Memory in use" points={memoryUsedSeries(points)} yMaximum={memoryTotal || 1} formatValue={formatBytes} {...common} />
        {swapTotal > 0 ? (
          <MachineStatsChart title="Swap in use" points={swapUsedSeries(points)} yMaximum={swapTotal} formatValue={formatBytes} {...common} />
        ) : null}
        {historyDriveMountPoints(points).map(mountPoint => (
          <MachineStatsChart key={`drive-${mountPoint}`} title={`${mountPoint} used`} points={driveUsedPercentSeries(points, mountPoint)} yMaximum={100} formatValue={formatChartPercent} {...common} />
        ))}
        {historyBatteryNames(points).map(name => (
          <MachineStatsChart key={`battery-${name}`} title={`Battery ${name} charge`} points={batteryChargeSeries(points, name)} yMaximum={100} formatValue={formatChartPercent} {...common} />
        ))}
      </div>
      <p className={styles.muted}>
        {points.length} buckets of {formatDurationSeconds(step)}; each shows the newest reading in it, and CPU also its average and peak.
      </p>
      <HistoryTable history={history} />
    </>
  )
}

/** The same numbers as a table, so no value needs the pointer to be read. */
function HistoryTable({ history }: { history: MachineStatsHistory }) {
  const rangeSeconds = (Date.parse(history.until) - Date.parse(history.since)) / 1000
  const mountPoints = historyDriveMountPoints(history.points)
  return (
    <details className={styles.tableDetails}>
      <summary>Show as a table</summary>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th><th>Readings</th><th>CPU average</th><th>CPU peak</th><th>Memory</th><th>Swap</th>
              {mountPoints.map(mountPoint => <th key={mountPoint}>{mountPoint}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...history.points].reverse().map(point => (
              <tr key={point.at}>
                <td>{formatChartTime(Date.parse(point.at), rangeSeconds)}</td>
                <td>{point.sample_count}</td>
                <td>{formatPercent(point.cpu_usage_percent_average)}</td>
                <td>{formatPercent(point.cpu_usage_percent_maximum)}</td>
                <td>{point.stats.memory_total_bytes ? formatBytes(point.stats.memory_used_bytes ?? 0) : '—'}</td>
                <td>{point.stats.swap_total_bytes ? formatBytes(point.stats.swap_used_bytes ?? 0) : '—'}</td>
                {mountPoints.map(mountPoint => {
                  const drive = point.stats.drives?.find(candidate => candidate.mount_point === mountPoint)
                  return <td key={mountPoint}>{drive ? formatPercent(percentOf(drive.used_bytes, drive.total_bytes)) : '—'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
