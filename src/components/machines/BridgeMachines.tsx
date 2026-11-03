import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  MachineBattery,
  MachineDrive,
  MachineGPU,
  MachineStats,
  MachineStatsHistory,
  MachineStatsOverview,
} from '@kayushkin/llm-bridge-types'
import { useBridgeConfig, type BridgeConfig } from '../../context'
import {
  MACHINE_STATS_HISTORY_RANGES,
  MACHINE_STATS_NOT_REPORTED_TEXT,
  batteryChargeSeries,
  batteryLevel,
  batteryStateText,
  batteryTimeText,
  commitCharge,
  cpuAverageSeries,
  cpuMaximumSeries,
  driveFreeText,
  driveUsedPercentSeries,
  formatBytes,
  formatChartTime,
  formatDurationSeconds,
  formatPercent,
  gpuMemoryPercent,
  gpuMemoryUsedSeries,
  gpuUsageSeries,
  historyBatteryNames,
  historyDriveMountPoints,
  historyGPUAt,
  historyGPUs,
  isUnsetTime,
  largestGPUMemoryTotal,
  largestTotal,
  machineKind,
  machineReadingParts,
  machineStatsFreshness,
  machineStatsSourceNote,
  machineUptimeSeconds,
  memoryBreakdown,
  memoryLevel,
  memoryPressurePercent,
  memoryUsedSeries,
  percentOf,
  runnerConnectionText,
  swapUsedSeries,
  usageLevel,
  historyHasWSL,
  wslCPUSeries,
  wslMemoryUsedSeries,
  type MachineReadingPart,
  type MachineStatsHistoryRange,
  type MachineStatsServer,
} from '../../machineStats'
import {
  machineStatsServerConfig,
  useMachineStatsHistory,
  useMachineStatsOverview,
  useMachineStatsServers,
} from '../../useMachineStats'
import { timeAgo } from '../../utils'
import { MachineStatsChart } from './MachineStatsChart'
import {
  Bar,
  BatteryGlyph,
  Dial,
  LevelWord,
  MachinePicture,
  MemoryBar,
  ThinBarRow,
  type MachinePictureName,
} from './MachineGauges'
import styles from './BridgeMachines.module.css'

/**
 * The Machines page: the health of every machine this server knows and every
 * machine each connected server knows — CPU, GPU, memory, swap, drives,
 * batteries, uptime and OS — from llm-bridge-server's `GET /machines/stats`,
 * read every 30 seconds, with each machine's history from
 * `GET /machines/{id}/stats/history` when its card is opened.
 *
 * A section per server, this one first. A connected server is read through
 * this server's proxy for the connection. One that cannot be read now says
 * why; one built before machine stats says that, not an error.
 *
 * Each measure has its own mark (`MachineGauges.tsx`). The zine skin also
 * paints a picture beside each section and card from the empty
 * `.bc-machine-picture` hooks; the other themes hide them.
 */
export function BridgeMachines() {
  const config = useBridgeConfig()
  const { servers, error } = useMachineStatsServers(config)
  // Re-render once a minute so "last reported" and uptime keep moving between polls.
  const now = useMinuteClock()

  return (
    <div className={`${styles.page} bc-machines`}>
      <header className={styles.header}>
        <h2 className={`${styles.title} page-title`}>Machines</h2>
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
    <section className={`${styles.server} bc-machine-server`} aria-label={server.label}>
      <h3 className={`${styles.serverHeading} bc-machine-server-heading`}>
        <span className={styles.serverName}>{server.label}</span>
        <span className={styles.chip}>{server.connectionId === null ? 'this server' : 'connected server'}</span>
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
      {answer?.state === 'not reported' ? (
        <div className={`${styles.notReported} bc-machine-not-reported`}>
          <MachinePicture name="crab-waiting" />
          <p className={styles.notice}>{MACHINE_STATS_NOT_REPORTED_TEXT}</p>
        </div>
      ) : null}
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
  const kind = machineKind(latest)
  const sourceNote = latest ? machineStatsSourceNote(latest.source) : ''

  return (
    <article
      className={`${styles.card} ${freshness !== 'fresh' ? styles.cardStale : ''} ${open ? styles.cardOpen : ''} bc-machine-card`}
      data-freshness={freshness}
      data-open={open ? 'true' : undefined}
    >
      <header className={styles.cardHeader}>
        {kind ? <MachinePicture name={kind} /> : null}
        <div className={styles.cardIdentity}>
          <h4 className={`${styles.cardTitle} bc-machine-card-title`}>
            {machine.emoji ? <span aria-hidden="true">{machine.emoji} </span> : null}{machine.name}
          </h4>
          {sourceNote ? <p className={styles.cardSubtitle}><span className={styles.chip}>{sourceNote}</span></p> : null}
        </div>
        <div className={styles.cardStatus}>
          <FreshnessPill freshness={freshness} collectedAt={latest?.collected_at} />
          {runnerText ? <span className={styles.chip}>{runnerText}</span> : null}
          <button type="button" className={`${styles.button} bc-machine-button`} aria-expanded={open} aria-controls={historyID} onClick={onToggle}>
            {open ? 'Hide history' : 'History'}
          </button>
        </div>
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
  if (freshness === 'never reported') return <span className={`${styles.pill} ${styles.pillStale} bc-machine-pill`} data-freshness={freshness}>not reporting</span>
  const when = new Date(collectedAt!).toLocaleString()
  if (freshness === 'stale') {
    return <span className={`${styles.pill} ${styles.pillStale} bc-machine-pill`} data-freshness={freshness} title={when}>stale · last reported {timeAgo(collectedAt!)} ({when})</span>
  }
  return <span className={`${styles.pill} ${styles.pillFresh} bc-machine-pill`} data-freshness={freshness} title={when}>reporting</span>
}

/** One part of a card: a heading with the zine's picture for it, a headline
 *  value beside the heading, and the marks under it. */
function MachineSection({ picture, title, headline, children }: {
  picture: MachinePictureName
  title: string
  headline?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`${styles.section} bc-machine-section`} data-section={picture} aria-label={title}>
      <h5 className={`${styles.sectionHeading} bc-machine-section-heading`}>
        <MachinePicture name={picture} />
        <span className={`${styles.sectionTitle} bc-machine-section-title`}>{title}</span>
        {headline ? <span className={styles.sectionHeadline}>{headline}</span> : null}
      </h5>
      {children}
    </section>
  )
}

export function MachineReading({ stats, now, fresh }: { stats: MachineStats; now: Date; fresh: boolean }) {
  const parts = machineReadingParts(stats)
  return (
    <div className={styles.reading}>
      <div className={`${styles.parts} ${parts.length > 1 ? styles.partsSideBySide : ''}`}>
        {parts.map(part => <ReadingPart key={part.key} part={part} now={now} fresh={fresh} />)}
      </div>
    </div>
  )
}

/** One part of a card — a whole machine, or the Windows host or the WSL
 *  machine of a runner in WSL — with its own OS, kernel and uptime lines. */
function ReadingPart({ part, now, fresh }: { part: MachineReadingPart; now: Date; fresh: boolean }) {
  const { stats } = part
  // A machine that stopped reporting may be down, so its uptime is given as
  // of its last reading rather than carried on to now.
  const uptime = machineUptimeSeconds(stats, fresh ? now : new Date(stats.collected_at))
  const gpus = stats.gpus ?? []
  // Each part lists what it could not read itself, so a Windows error does
  // not read as the WSL machine's.
  const errors = stats.collection_errors ?? []

  return (
    <div className={`${styles.part} bc-machine-part`} data-part={part.key}>
      {part.label ? <h5 className={`${styles.partHeading} bc-machine-part-heading`}>{part.label}</h5> : null}
      <dl className={`${styles.facts} bc-machine-facts`}>
        {stats.operating_system ? <><dt>OS</dt><dd>{stats.operating_system}</dd></> : null}
        {stats.kernel_version ? <><dt>Kernel</dt><dd>{stats.kernel_version}</dd></> : null}
        {stats.hostname ? <><dt>Host</dt><dd>{stats.hostname}</dd></> : null}
        <dt>Uptime</dt>
        <dd>
          {uptime === null
            ? <span className={styles.muted}>not reported</span>
            : <span>{fresh ? 'Up' : 'Was up'} {formatDurationSeconds(uptime)}{fresh ? '' : ' at its last reading'}</span>}
          {!isUnsetTime(stats.booted_at) ? <span className={styles.muted}> · last reboot {new Date(stats.booted_at!).toLocaleString()}</span> : null}
        </dd>
      </dl>

      <div className={styles.dialRow}>
        <CPUSection stats={stats} />
        {gpus.map((gpu, index) => <GPUSection key={`${index}-${gpu.name}`} gpu={gpu} numbered={gpus.length > 1 ? index + 1 : null} />)}
      </div>

      <MemorySection stats={stats} />
      {stats.drives?.length ? <DrivesSection drives={stats.drives} virtualDisk={part.key === 'wsl'} /> : null}
      {stats.batteries?.length ? <BatterySection batteries={stats.batteries} /> : null}

      {errors.length ? (
        <div className={styles.collectionErrors}>
          <span>Could not read:</span>
          <ul>{errors.map(text => <li key={text}>{text}</li>)}</ul>
        </div>
      ) : null}
    </div>
  )
}

function CPUSection({ stats }: { stats: MachineStats }) {
  const percent = stats.cpu_usage_percent
  return (
    <MachineSection picture="cpu" title="CPU">
      <div className={styles.dialBody}>
        {percent !== undefined && percent !== null
          ? <Dial percent={percent} label="CPU in use" hue="cpu" />
          : <span className={styles.muted}>use not reported</span>}
        <div className={styles.dialDetail}>
          {stats.cpu_model ? <span className={styles.model}>{stats.cpu_model}</span> : null}
          {stats.cpu_logical_cores ? <span>{stats.cpu_logical_cores} logical cores</span> : null}
          {stats.load_average?.length ? <span>load {stats.load_average.map(load => load.toFixed(2)).join(' · ')}</span> : null}
        </div>
      </div>
    </MachineSection>
  )
}

function GPUSection({ gpu, numbered }: { gpu: MachineGPU; numbered: number | null }) {
  const memoryPercent = gpuMemoryPercent(gpu)
  return (
    <MachineSection picture="gpu" title={numbered === null ? 'GPU' : `GPU ${numbered}`}>
      <div className={styles.dialBody}>
        {gpu.usage_percent !== undefined && gpu.usage_percent !== null
          ? <Dial percent={gpu.usage_percent} label={`${gpu.name} in use`} hue="gpu" />
          : <span className={styles.muted}>use not reported</span>}
        <div className={styles.dialDetail}>
          <span className={styles.model}>{gpu.name}</span>
          {memoryPercent !== null ? (
            <>
              <span>{formatBytes(gpu.memory_used_bytes!)} of {formatBytes(gpu.memory_total_bytes!)} memory</span>
              <Bar percent={memoryPercent} label={`${gpu.name} memory in use`} hue="gpu" thickness="thin" />
            </>
          ) : gpu.memory_used_bytes !== undefined && gpu.memory_used_bytes !== null
            ? <span>{formatBytes(gpu.memory_used_bytes)} memory in use</span>
            : null}
          {gpu.temperature_celsius !== undefined && gpu.temperature_celsius !== null ? <span>{Math.round(gpu.temperature_celsius)} °C</span> : null}
        </div>
      </div>
    </MachineSection>
  )
}

function MemorySection({ stats }: { stats: MachineStats }) {
  const breakdown = memoryBreakdown(stats)
  const level = memoryLevel(stats)
  const pressure = memoryPressurePercent(stats)
  const commit = commitCharge(stats)
  const swapPercent = percentOf(stats.swap_used_bytes ?? 0, stats.swap_total_bytes ?? 0)
  if (!breakdown && !stats.swap_total_bytes) return null

  return (
    <MachineSection
      picture="memory"
      title="Memory"
      headline={breakdown ? (
        <>
          <span className={styles.value}>{formatBytes(breakdown.usedBytes)} of {formatBytes(breakdown.totalBytes)}</span>
          <span className={styles.muted}>{formatPercent(breakdown.usedPercent)}</span>
          {/* On a Mac the pressure row carries the level; here it would repeat it. */}
          {pressure === null ? <LevelWord level={level} /> : null}
        </>
      ) : null}
    >
      {breakdown ? <MemoryBar breakdown={breakdown} level={level} /> : null}
      <div className={styles.thinRows}>
        {pressure !== null ? (
          <ThinBarRow
            name="Pressure"
            percent={pressure}
            valueText={formatPercent(pressure)}
            hue="memory"
            note={`macOS could free ${formatPercent(stats.memory_free_under_pressure_percent)} of memory`}
          />
        ) : null}
        {commit ? (
          <ThinBarRow
            name="Commit charge"
            percent={commit.percent}
            valueText={`${formatBytes(commit.committedBytes)} of ${formatBytes(commit.limitBytes)}`}
            hue="memory"
            note="memory promised to programs, against RAM and the page file"
          />
        ) : null}
        {stats.swap_total_bytes ? (
          <ThinBarRow
            name="Swap"
            percent={swapPercent ?? 0}
            valueText={`${formatBytes(stats.swap_used_bytes ?? 0)} of ${formatBytes(stats.swap_total_bytes)}`}
            hue="swap"
          />
        ) : null}
      </div>
    </MachineSection>
  )
}

function DrivesSection({ drives, virtualDisk }: { drives: readonly MachineDrive[]; virtualDisk: boolean }) {
  const title = virtualDisk ? (drives.length === 1 ? 'Virtual disk' : 'Virtual disks') : (drives.length === 1 ? 'Drive' : 'Drives')
  return (
    <MachineSection picture="drive" title={title}>
      <div className={styles.drives}>
        {drives.map(drive => <DriveRow key={drive.mount_point} drive={drive} />)}
      </div>
    </MachineSection>
  )
}

function DriveRow({ drive }: { drive: MachineDrive }) {
  const percent = percentOf(drive.used_bytes, drive.total_bytes)
  return (
    <div className={styles.drive}>
      <div className={styles.driveHead}>
        <span className={styles.driveName} title={drive.device}>
          <span className={`${styles.mountPoint} bc-machine-mount-point`}>{drive.mount_point}</span>
          {drive.label ? <span className={styles.driveLabel}>{drive.label}</span> : null}
        </span>
        <span className={styles.driveFree}>
          <LevelWord level={usageLevel(percent)} />
          {driveFreeText(drive)}
        </span>
      </div>
      <div className={styles.driveBarRow}>
        <Bar percent={percent ?? 0} label={`${drive.mount_point} in use`} hue="drive" thickness="thick" />
        <span className={`${styles.driveUsed} ${styles.value}`}>{formatPercent(percent)}</span>
      </div>
      <div className={styles.rowDetail}>
        <span>{formatBytes(drive.used_bytes)} of {formatBytes(drive.total_bytes)} used</span>
        {drive.filesystem_type ? <span>{drive.filesystem_type}</span> : null}
        {drive.device ? <span>{drive.device}</span> : null}
      </div>
    </div>
  )
}

function BatterySection({ batteries }: { batteries: readonly MachineBattery[] }) {
  return (
    <MachineSection picture="battery" title={batteries.length === 1 ? 'Battery' : 'Batteries'}>
      {batteries.map(battery => <BatteryRow key={battery.name} battery={battery} />)}
    </MachineSection>
  )
}

function BatteryRow({ battery }: { battery: MachineBattery }) {
  const time = batteryTimeText(battery)
  return (
    <div className={styles.batteryRow}>
      <BatteryGlyph battery={battery} />
      <div className={styles.batteryText}>
        <span className={styles.batteryCharge}>
          <span className={styles.batteryPercent}>{formatPercent(battery.charge_percent)}</span>
          <span>{batteryStateText(battery.state)}</span>
          {time ? <span className={styles.value}>{time}</span> : null}
          <LevelWord level={batteryLevel(battery)} word={batteryLevel(battery) === 'danger' ? 'nearly empty' : 'low'} />
        </span>
        <span className={styles.rowDetail}>
          <span title="The name the operating system gives this battery">{battery.name}</span>
          {battery.health_percent !== undefined ? <span>health {formatPercent(battery.health_percent)} of design capacity</span> : null}
          {battery.cycle_count !== undefined ? <span>{battery.cycle_count} cycles</span> : null}
        </span>
      </div>
    </div>
  )
}

function MachineHistory({ serverConfig, machineID }: { serverConfig: BridgeConfig; machineID: string }) {
  const [range, setRange] = useState<MachineStatsHistoryRange>(MACHINE_STATS_HISTORY_RANGES[1])
  const { answer, loading, error } = useMachineStatsHistory(serverConfig, machineID, range)

  return (
    <div className={styles.historyBody}>
      <div className={`${styles.rangeRow} bc-machine-range`} role="group" aria-label="History range">
        {MACHINE_STATS_HISTORY_RANGES.map(option => (
          <button
            key={option.key}
            type="button"
            className={`${styles.button} ${option.key === range.key ? styles.buttonSelected : ''} bc-machine-button`}
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
  // A runner in WSL reads two machines; its own charts say which is which.
  const hasWSL = historyHasWSL(points)
  const title = (measure: string) => hasWSL ? `Windows ${measure[0].toLowerCase()}${measure.slice(1)}` : measure
  const wslMemoryTotal = hasWSL ? largestTotal(points, stats => stats.wsl?.memory_total_bytes) : 0

  return (
    <>
      <div className={styles.charts}>
        <MachineStatsChart
          title={hasWSL ? 'Windows CPU in use' : 'CPU in use'}
          hue="cpu"
          points={cpuAverageSeries(points)}
          bandTops={cpuMaximumSeries(points)}
          lineName="average"
          bandName="peak"
          yMaximum={100}
          formatValue={formatChartPercent}
          {...common}
        />
        {historyGPUs(points).flatMap(gpu => {
          const memoryTotalOfGPU = largestGPUMemoryTotal(points, gpu)
          const memorySeries = gpuMemoryUsedSeries(points, gpu)
          const memoryAxis = memoryTotalOfGPU || Math.max(0, ...memorySeries.map(point => point.value ?? 0))
          const usageSeries = gpuUsageSeries(points, gpu)
          return [
            usageSeries.some(point => point.value !== null)
              ? <MachineStatsChart key={`gpu-${gpu.index}`} title={`${gpu.name} in use`} hue="gpu" points={usageSeries} yMaximum={100} formatValue={formatChartPercent} {...common} />
              : null,
            memoryAxis > 0
              ? <MachineStatsChart key={`gpu-memory-${gpu.index}`} title={`${gpu.name} memory`} hue="gpu" points={memorySeries} yMaximum={memoryAxis} formatValue={formatBytes} {...common} />
              : null,
          ]
        })}
        <MachineStatsChart title={title('Memory in use')} hue="memory" points={memoryUsedSeries(points)} yMaximum={memoryTotal || 1} formatValue={formatBytes} {...common} />
        {swapTotal > 0 ? (
          <MachineStatsChart title={title('Swap in use')} hue="swap" points={swapUsedSeries(points)} yMaximum={swapTotal} formatValue={formatBytes} {...common} />
        ) : null}
        {hasWSL ? <MachineStatsChart title="WSL CPU in use" hue="cpu" points={wslCPUSeries(points)} yMaximum={100} formatValue={formatChartPercent} {...common} /> : null}
        {wslMemoryTotal > 0 ? (
          <MachineStatsChart title="WSL memory in use" hue="memory" points={wslMemoryUsedSeries(points)} yMaximum={wslMemoryTotal} formatValue={formatBytes} {...common} />
        ) : null}
        {historyDriveMountPoints(points).map(mountPoint => (
          <MachineStatsChart key={`drive-${mountPoint}`} title={`${mountPoint} used`} hue="drive" points={driveUsedPercentSeries(points, mountPoint)} yMaximum={100} formatValue={formatChartPercent} {...common} />
        ))}
        {historyBatteryNames(points).map(name => (
          <MachineStatsChart key={`battery-${name}`} title={`Battery ${name} charge`} hue="battery" points={batteryChargeSeries(points, name)} yMaximum={100} formatValue={formatChartPercent} {...common} />
        ))}
      </div>
      <p className={styles.muted}>
        {points.length} buckets of {formatDurationSeconds(step)}; each shows the newest reading in it, and {hasWSL ? 'the Windows CPU' : 'CPU'} also its average and peak.
      </p>
      <HistoryTable history={history} />
    </>
  )
}

/** The same numbers as a table, so no value needs the pointer to be read. */
function HistoryTable({ history }: { history: MachineStatsHistory }) {
  const rangeSeconds = (Date.parse(history.until) - Date.parse(history.since)) / 1000
  const mountPoints = historyDriveMountPoints(history.points)
  const gpus = historyGPUs(history.points)
  const hasWSL = historyHasWSL(history.points)
  return (
    <details className={styles.tableDetails}>
      <summary>Show as a table</summary>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th><th>Readings</th><th>CPU average</th><th>CPU peak</th><th>Memory</th><th>Swap</th>
              {gpus.map(gpu => <th key={`gpu-${gpu.index}`}>{gpu.name}</th>)}
              {hasWSL ? <><th>WSL CPU</th><th>WSL memory</th></> : null}
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
                {gpus.map(gpu => <td key={`gpu-${gpu.index}`}>{formatPercent(historyGPUAt(point, gpu)?.usage_percent)}</td>)}
                {hasWSL ? (
                  <>
                    <td>{formatPercent(point.stats.wsl?.cpu_usage_percent)}</td>
                    <td>{point.stats.wsl?.memory_total_bytes ? formatBytes(point.stats.wsl.memory_used_bytes ?? 0) : '—'}</td>
                  </>
                ) : null}
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
