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
  machinePartTitle,
  memoryAlerts,
  formatBytesOfTotal,
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
  LEVEL_WORD,
  LevelWord,
  MachinePicture,
  MemoryBar,
  MemoryKey,
  ThinBarRow,
  type MachineHue,
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

export function MachineCard({ overview, now, open, onToggle, serverConfig, initiallyShowDetails = false }: {
  overview: MachineStatsOverview
  now: Date
  /** Whether its history is shown. */
  open: boolean
  onToggle: () => void
  serverConfig: BridgeConfig
  initiallyShowDetails?: boolean
}) {
  const { machine, latest } = overview
  const [showDetails, setShowDetails] = useState(initiallyShowDetails)
  const freshness = machineStatsFreshness(latest, now)
  const fresh = freshness === 'fresh'
  const runnerText = runnerConnectionText(overview)
  const historyID = `machine-history-${machine.id}`
  const detailsID = `machine-details-${machine.id}`
  const kind = machineKind(latest)
  const parts = latest ? machineReadingParts(latest) : []
  const uptime = latest && fresh ? machineUptimeSeconds(latest, now) : null

  return (
    <article
      className={`${styles.card} ${!fresh ? styles.cardStale : ''} ${open ? styles.cardOpen : ''} ${parts.length > 1 ? styles.cardTwoParts : ''} bc-machine-card`}
      data-freshness={freshness}
      data-open={open ? 'true' : undefined}
    >
      <header className={styles.cardHeader}>
        {kind ? <MachinePicture name={kind} size="small" /> : null}
        <h4 className={`${styles.cardTitle} bc-machine-card-title`} title={runnerText ?? undefined}>
          {machine.emoji ? <span aria-hidden="true">{machine.emoji} </span> : null}{machine.name}
        </h4>
        <FreshnessMark freshness={freshness} collectedAt={latest?.collected_at} runnerText={runnerText} />
        {/* A stale machine may be down: its uptime at the last reading is in Details. */}
        {uptime !== null && fresh ? <span className={styles.uptime} title={uptimeTitle(latest!)}>up {formatDurationSeconds(uptime)}</span> : null}
        <span className={styles.cardButtons}>
          {latest ? (
            <button type="button" className={`${styles.linkButton} bc-machine-button`} aria-expanded={showDetails} aria-controls={detailsID} onClick={() => setShowDetails(shown => !shown)}>
              {showDetails ? 'Less' : 'Details'}
            </button>
          ) : null}
          <button type="button" className={`${styles.linkButton} bc-machine-button`} aria-expanded={open} aria-controls={historyID} onClick={onToggle} title={open ? 'Hide history' : 'History'}>
            <HistoryIcon />
            <span className={styles.visuallyHidden}>{open ? 'Hide history' : 'History'}</span>
          </button>
        </span>
      </header>
      {latest ? (
        <>
          {parts.length === 1 ? <p className={`${styles.osLine} bc-machine-os-line`} title={uptimeTitle(latest)}>{machinePartTitle(parts[0]) || 'operating system not reported'}</p> : null}
          {parts.length === 1 && machineStatsSourceNote(latest.source) ? <span className={styles.sourceNote}>{machineStatsSourceNote(latest.source)}</span> : null}
          <div className={`${styles.reading} ${parts.length > 1 ? styles.readingTwoParts : ''}`}>
            {parts.map(part => <ReadingPart key={part.key} part={part} showTitle={parts.length > 1} />)}
          </div>
          {!showDetails && latest.collection_errors?.length ? (
            <span className={styles.errorChip}>could not read {latest.collection_errors.length === 1 ? 'one part' : `${latest.collection_errors.length} parts`} · see Details</span>
          ) : null}
          {showDetails ? (
            <div id={detailsID} className={`${styles.details} ${parts.length > 1 ? styles.readingTwoParts : ''} bc-machine-details`}>
              {parts.map(part => <PartDetails key={part.key} part={part} showTitle={parts.length > 1} now={now} fresh={fresh} />)}
            </div>
          ) : null}
        </>
      ) : <p className={styles.muted}>This machine has never sent a reading.</p>}
      {open ? (
        <div id={historyID} className={styles.history}>
          <MachineHistory serverConfig={serverConfig} machineID={machine.id} />
        </div>
      ) : null}
    </article>
  )
}

function HistoryIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 13.5h13M2.5 10.5l3.5-4 3 2.5 4.5-6" />
    </svg>
  )
}

function uptimeTitle(stats: MachineStats): string {
  const words: string[] = []
  if (stats.hostname) words.push(`host ${stats.hostname}`)
  if (!isUnsetTime(stats.booted_at)) words.push(`last reboot ${new Date(stats.booted_at!).toLocaleString()}`)
  return words.join(' · ')
}

/** A dot and a word: reporting, stale (and since when), or not reporting. */
function FreshnessMark({ freshness, collectedAt, runnerText }: {
  freshness: ReturnType<typeof machineStatsFreshness>
  collectedAt: string | undefined
  runnerText: string | null
}) {
  const when = collectedAt && freshness !== 'never reported' ? new Date(collectedAt).toLocaleString() : ''
  const word = freshness === 'fresh' ? 'reporting'
    : freshness === 'stale' ? `stale · ${timeAgo(collectedAt!)}`
      : 'not reporting'
  const title = [word === 'reporting' ? 'reporting' : '', when ? `last reading ${when}` : '', runnerText ?? ''].filter(Boolean).join(' · ')
  return (
    <span className={`${styles.freshness} bc-machine-freshness`} data-freshness={freshness} title={title || undefined}>
      <span className={`${styles.freshnessDot} bc-machine-freshness-dot`} aria-hidden="true" />
      {/* A machine that reports is the usual case: its green dot says so, and
          the word is kept for screen readers only. */}
      <span className={freshness === 'fresh' ? styles.visuallyHidden : undefined}>{word}</span>
    </span>
  )
}

/** One compact row: an icon, a short name, the mark and the number. Rows
 *  share their parent's grid columns, so every bar in a part lines up. */
function MeasureRow({ picture, name, nameTitle, mark, value }: {
  picture: MachinePictureName
  name: ReactNode
  nameTitle?: string
  mark: ReactNode
  value: ReactNode
}) {
  return (
    <div className={`${styles.row} bc-machine-row`} data-row={picture}>
      <MachinePicture name={picture} size="small" />
      <span className={styles.rowName} title={nameTitle}>{name}</span>
      <span className={styles.rowMark}>{mark}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

/** A part of a card — a whole machine, or the Windows host or the WSL
 *  machine of a runner in WSL — as compact rows. */
function ReadingPart({ part, showTitle }: { part: MachineReadingPart; showTitle: boolean }) {
  const { stats } = part
  const gpus = stats.gpus ?? []
  const breakdown = memoryBreakdown(stats)
  const level = memoryLevel(stats)
  const alerts = memoryAlerts(stats)
  const cpu = stats.cpu_usage_percent

  return (
    <div className={`${styles.part} bc-machine-part`} data-part={part.key}>
      {showTitle ? (
        <h5 className={`${styles.partTitle} bc-machine-part-heading`} title={`${machinePartTitle(part)}${uptimeTitle(stats) ? `\n${uptimeTitle(stats)}` : ''}`}>
          {machinePartTitle(part) || part.label}
        </h5>
      ) : null}
      <div className={styles.dials}>
        {cpu !== undefined && cpu !== null ? (
          <SmallDial picture="cpu" name="CPU" percent={cpu} hue="cpu" title={[stats.cpu_model, stats.cpu_logical_cores ? `${stats.cpu_logical_cores} logical cores` : ''].filter(Boolean).join(' · ')} />
        ) : <span className={styles.muted}>CPU not reported</span>}
        {gpus.map((gpu, index) => gpu.usage_percent !== undefined && gpu.usage_percent !== null ? (
          <SmallDial key={`${index}-${gpu.name}`} picture="gpu" name={gpus.length > 1 ? `GPU ${index + 1}` : 'GPU'} percent={gpu.usage_percent} hue="gpu" title={gpu.name} />
        ) : null)}
      </div>
      <div className={styles.rows}>
        {breakdown ? (
          <MeasureRow
            picture="memory"
            name="RAM"
            mark={<MemoryBar breakdown={breakdown} level={level} />}
            value={(
              <>
                <span>{formatBytesOfTotal(breakdown.usedBytes, breakdown.totalBytes)}</span>
                <span className={styles.percent}>{formatPercent(breakdown.usedPercent)}</span>
                <LevelWord level={level} />
              </>
            )}
          />
        ) : null}
        {alerts.length ? (
          <span className={styles.rowAlerts}>
            {alerts.map(alert => <LevelWord key={alert.name} level={alert.level} word={`${alert.name} ${LEVEL_WORD[alert.level]}`} />)}
          </span>
        ) : null}
        {(stats.drives ?? []).map(drive => {
          const percent = percentOf(drive.used_bytes, drive.total_bytes)
          return (
            <MeasureRow
              key={drive.mount_point}
              picture="drive"
              name={<span className={`${styles.mountPoint} bc-machine-mount-point`}>{drive.mount_point}</span>}
              nameTitle={[drive.label, part.key === 'wsl' ? 'virtual disk' : '', drive.device].filter(Boolean).join(' · ') || undefined}
              mark={<Bar percent={percent ?? 0} label={`${drive.mount_point} in use`} hue="drive" thickness="thin" />}
              value={(
                <>
                  <span className={styles.percent}>{formatPercent(percent)}</span>
                  <span className={styles.free}>· {formatBytes(drive.free_bytes)} free</span>
                  <LevelWord level={usageLevel(percent)} />
                </>
              )}
            />
          )
        })}
        {(stats.batteries ?? []).map(battery => {
          const time = batteryTimeText(battery)
          const batteryLevelNow = batteryLevel(battery)
          return (
            <MeasureRow
              key={battery.name}
              picture="battery"
              name="Battery"
              nameTitle={battery.name}
              mark={<BatteryGlyph battery={battery} />}
              value={(
                <>
                  <span className={styles.percent}>{formatPercent(battery.charge_percent)}</span>
                  <span className={styles.free}>· {time ?? batteryStateText(battery.state)}</span>
                  <LevelWord level={batteryLevelNow} word={batteryLevelNow === 'danger' ? 'nearly empty' : 'low'} />
                </>
              )}
            />
          )
        })}
      </div>
    </div>
  )
}

/** A dial about 44px across with its name and number beside it. */
function SmallDial({ picture, name, percent, hue, title }: { picture: MachinePictureName; name: string; percent: number; hue: MachineHue; title: string }) {
  const level = usageLevel(percent)
  return (
    <div className={`${styles.smallDial} bc-machine-small-dial`} title={title || undefined}>
      <MachinePicture name={picture} size="small" />
      <Dial percent={percent} label={`${name} in use`} hue={hue} size="small" />
      <span className={styles.smallDialText}>
        <span className={styles.smallDialName}>{name}</span>
        <span className={`${styles.smallDialNumber} bc-machine-dial-number`}>{formatPercent(percent)}</span>
      </span>
      <LevelWord level={level} />
    </div>
  )
}

/** Everything the compact rows leave out, for one part: the facts, the
 *  memory key, swap, pressure and commit charge, each GPU and drive in full,
 *  the battery's health, and what could not be read. */
function PartDetails({ part, showTitle, now, fresh }: { part: MachineReadingPart; showTitle: boolean; now: Date; fresh: boolean }) {
  const { stats } = part
  // A machine that stopped reporting may be down, so its uptime is given as
  // of its last reading rather than carried on to now.
  const uptime = machineUptimeSeconds(stats, fresh ? now : new Date(stats.collected_at))
  const breakdown = memoryBreakdown(stats)
  const level = memoryLevel(stats)
  const pressure = memoryPressurePercent(stats)
  const commit = commitCharge(stats)
  const swapPercent = percentOf(stats.swap_used_bytes ?? 0, stats.swap_total_bytes ?? 0)

  return (
    <div className={styles.part}>
      {showTitle ? <h5 className={`${styles.partTitle} bc-machine-part-heading`}>{part.label}</h5> : null}
      <dl className={`${styles.facts} bc-machine-facts`}>
        {stats.operating_system ? <><dt>OS</dt><dd>{stats.operating_system}</dd></> : null}
        {stats.kernel_version ? <><dt>Kernel</dt><dd>{stats.kernel_version}</dd></> : null}
        {stats.hostname ? <><dt>Host</dt><dd>{stats.hostname}</dd></> : null}
        {uptime !== null ? <><dt>Uptime</dt><dd>{fresh ? 'up' : 'was up'} {formatDurationSeconds(uptime)}{fresh ? '' : ' at its last reading'}</dd></> : null}
        {!isUnsetTime(stats.booted_at) ? <><dt>Last reboot</dt><dd>{new Date(stats.booted_at!).toLocaleString()}</dd></> : null}
        {stats.cpu_model ? <><dt>CPU</dt><dd>{stats.cpu_model}</dd></> : null}
        {stats.cpu_logical_cores ? <><dt>Cores</dt><dd>{stats.cpu_logical_cores} logical</dd></> : null}
        {stats.load_average?.length ? <><dt>Load</dt><dd>{stats.load_average.map(load => load.toFixed(2)).join(' · ')}</dd></> : null}
        {(stats.gpus ?? []).map((gpu, index) => (
          <GPUFacts key={`${index}-${gpu.name}`} gpu={gpu} numbered={(stats.gpus ?? []).length > 1 ? index + 1 : null} />
        ))}
        {(stats.drives ?? []).map(drive => (
          <DriveFacts key={drive.mount_point} drive={drive} />
        ))}
        {(stats.batteries ?? []).map(battery => (
          <BatteryFacts key={battery.name} battery={battery} />
        ))}
      </dl>
      {breakdown ? <MemoryKey breakdown={breakdown} level={level} /> : null}
      <div className={styles.thinRows}>
        {pressure !== null ? (
          <ThinBarRow name="Pressure" percent={pressure} valueText={formatPercent(pressure)} hue="memory"
            note={`macOS could free ${formatPercent(stats.memory_free_under_pressure_percent)} of memory`} />
        ) : null}
        {commit ? (
          <ThinBarRow name="Commit charge" percent={commit.percent} valueText={formatBytesOfTotal(commit.committedBytes, commit.limitBytes)} hue="memory"
            note="memory promised to programs, against RAM and the page file" />
        ) : null}
        {stats.swap_total_bytes ? (
          <ThinBarRow name="Swap" percent={swapPercent ?? 0} valueText={formatBytesOfTotal(stats.swap_used_bytes ?? 0, stats.swap_total_bytes)} hue="swap" />
        ) : null}
      </div>
      {stats.collection_errors?.length ? (
        <div className={styles.collectionErrors}>
          <span>Could not read:</span>
          <ul>{stats.collection_errors.map(text => <li key={text}>{text}</li>)}</ul>
        </div>
      ) : null}
    </div>
  )
}

function GPUFacts({ gpu, numbered }: { gpu: MachineGPU; numbered: number | null }) {
  const memoryPercent = gpuMemoryPercent(gpu)
  const words = [gpu.name]
  if (memoryPercent !== null) words.push(`${formatBytesOfTotal(gpu.memory_used_bytes!, gpu.memory_total_bytes!)} memory (${formatPercent(memoryPercent)})`)
  else if (gpu.memory_used_bytes !== undefined && gpu.memory_used_bytes !== null) words.push(`${formatBytes(gpu.memory_used_bytes)} memory in use`)
  if (gpu.temperature_celsius !== undefined && gpu.temperature_celsius !== null) words.push(`${Math.round(gpu.temperature_celsius)} °C`)
  return <><dt>{numbered === null ? 'GPU' : `GPU ${numbered}`}</dt><dd>{words.join(' · ')}</dd></>
}

function DriveFacts({ drive }: { drive: MachineDrive }) {
  const words = [
    drive.label ?? '',
    `${formatBytesOfTotal(drive.used_bytes, drive.total_bytes)} used`,
    driveFreeText(drive),
    drive.filesystem_type ?? '',
    drive.device ?? '',
  ].filter(Boolean)
  return <><dt className={styles.mountPoint}>{drive.mount_point}</dt><dd>{words.join(' · ')}</dd></>
}

function BatteryFacts({ battery }: { battery: MachineBattery }) {
  const words = [
    batteryStateText(battery.state),
    batteryTimeText(battery) ?? '',
    battery.health_percent !== undefined ? `health ${formatPercent(battery.health_percent)} of design capacity` : '',
    battery.cycle_count !== undefined ? `${battery.cycle_count} cycles` : '',
  ].filter(Boolean)
  return <><dt>{battery.name}</dt><dd>{words.join(' · ')}</dd></>
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
