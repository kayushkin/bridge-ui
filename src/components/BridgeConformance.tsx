import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBridgeConfig } from '../context'
import { HARNESS_LABEL, HARNESS_EMOJI } from '../constants'
import type { HarnessInfo } from '../types'
import type { ConformanceMatrix, ConformanceHarnessResult, ConformanceTestResult } from '@kayushkin/llm-bridge-types'

const ALL_FEATURES = [
  'start', 'message', 'resume', 'fork', 'compact', 'config',
  'discover', 'import', 'streaming', 'tool_calls', 'thinking', 'errors',
  'reasoning', 'system_prompt', 'context_used',
]

const FEATURE_LABELS: Record<string, string> = {
  start: 'Start',
  message: 'Message',
  resume: 'Resume',
  fork: 'Fork',
  compact: 'Compact',
  config: 'Config',
  discover: 'Discover',
  import: 'Import',
  streaming: 'Streaming',
  tool_calls: 'Tool Calls',
  thinking: 'Thinking',
  errors: 'Errors',
  reasoning: 'Reasoning',
  system_prompt: 'System Prompt',
  context_used: 'Context Used',
}

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  start: 'Start a new session. Sends the "start" JSON-RPC command and expects an EventSessionState with state=running.',
  message: 'Send a user message and receive a non-empty text result (EventResult).',
  resume: 'Resume a previously saved session by ID. Sends "start" with resume=true and expects a running session.',
  fork: 'Branch a new session from an existing one. Sends "start" with a fork param and expects a running session.',
  compact: 'Ask the harness to compact conversation history (summarize earlier turns). Expects an EventSystem response.',
  config: 'Apply runtime config (e.g. model, temperature) mid-session. Sends "config:<json>" and expects EventSystem.',
  discover: 'Run the harness binary with -discover and verify it prints a valid JSON array describing its capabilities.',
  import: 'Check that the binary supports -import-history for importing prior conversation history (exit code 2 = unsupported).',
  streaming: 'Verify incremental EventStream events arrive before the final EventResult, not just a single blob.',
  tool_calls: 'Model-emitted tool calls are executed and their results fed back into the conversation.',
  thinking: 'Extended-thinking / reasoning blocks are emitted as distinct events, separate from the final answer.',
  errors: 'Errors surface as EventError events rather than crashes or silent failures. Verified via MOCK_HARNESS_EMIT_ERROR=true.',
  reasoning: 'Harness accepts a reasoning-effort config and passes it through to the model.',
  system_prompt: 'Harness accepts a system_prompt param on session start and applies it to the conversation.',
  context_used: 'Result events include token usage fields (input/output/context window).',
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  pass: 'The expected JSON-RPC event arrived within the 10-second timeout and matched the predicate for this feature.',
  fail: 'The test ran but the harness responded with an error, the wrong event type, or nothing within the timeout.',
  skip: 'The feature is not applicable to this harness, or the harness explicitly reported it as unsupported.',
  untested: 'No test run has covered this harness yet. Click "Run Tests" to populate the matrix.',
}

interface ConformanceResponse {
  running: boolean
  matrix: ConformanceMatrix | null
}

type HarnessState = 'working' | 'untested' | 'broken' | 'unavailable'

function classifyHarness(h: HarnessInfo, hr?: ConformanceHarnessResult): HarnessState {
  if (!h.available) return 'unavailable'
  if (!hr) return 'untested'
  if (hr.summary.passed > 0) return 'working'
  return 'broken'
}

export function BridgeConformance() {
  const { fetch: apiFetch, basePath } = useBridgeConfig()
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [response, setResponse] = useState<ConformanceResponse | null>(null)
  const [polling, setPolling] = useState(false)
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({})

  const fetchMatrix = useCallback(async () => {
    const res = await apiFetch(`${basePath}/conformance`)
    if (res.ok) {
      const data: ConformanceResponse = await res.json()
      setResponse(data)
      return data.running
    }
    return false
  }, [apiFetch, basePath])

  useEffect(() => {
    apiFetch(`${basePath}/harnesses`).then(r => r.ok ? r.json() : []).then(setHarnesses).catch(() => {})
    fetchMatrix()
  }, [fetchMatrix, apiFetch, basePath])

  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      const stillRunning = await fetchMatrix()
      if (!stillRunning) setPolling(false)
    }, 2000)
    return () => clearInterval(id)
  }, [polling, fetchMatrix])

  const runTests = async () => {
    const res = await apiFetch(`${basePath}/conformance/run`, { method: 'POST' })
    if (res.ok) {
      setPolling(true)
      setResponse(prev => ({ running: true, matrix: prev?.matrix ?? null }))
    }
  }

  const matrix = response?.matrix
  const running = response?.running ?? false

  const resultsByHarness: Record<string, ConformanceHarnessResult> = {}
  if (matrix) {
    for (const hr of matrix.harnesses) {
      resultsByHarness[hr.harness] = hr
    }
  }

  const toggle = (name: string, defaultExpanded: boolean) => {
    setManualExpanded(prev => {
      const current = prev[name] ?? defaultExpanded
      return { ...prev, [name]: !current }
    })
  }

  return (
    <div className="cf-container">
      <div className="cf-header">
        <div>
          <h2 className="cf-title">Harness Conformance</h2>
          <p className="cf-subtitle">
            Tests each harness against the llm-bridge subprocess protocol. Unavailable or failing harnesses are collapsed — click a row to expand.
          </p>
        </div>
        <button className="cf-run-btn" onClick={runTests} disabled={running}>
          {running ? 'Running...' : 'Run Tests'}
        </button>
      </div>

      {running && (
        <div className="cf-running-banner">
          <span className="cf-spinner" /> Testing harnesses... results will update automatically.
        </div>
      )}

      {matrix && matrix.harnesses.length > 0 && (
        <div className="cf-generated">
          Last run: {new Date(matrix.generated_at).toLocaleString()}
        </div>
      )}

      {harnesses.length === 0 ? (
        <div className="cf-empty">No harnesses registered.</div>
      ) : (
        <div className="cf-table-wrapper">
          <table className="cf-table cf-table-flipped">
            <thead>
              <tr>
                <th className="cf-th-harness-col">Harness</th>
                {ALL_FEATURES.map(feature => (
                  <th key={feature} className="cf-th-feature-col">
                    <span className="cf-feature-label">{FEATURE_LABELS[feature] || feature}</span>
                    <InfoTip text={FEATURE_DESCRIPTIONS[feature] || ''} />
                  </th>
                ))}
                <th className="cf-th-summary-col">Summary</th>
              </tr>
            </thead>
            <tbody>
              {harnesses.map(h => {
                const hr = resultsByHarness[harnessKeyFromName(h.name)]
                const state = classifyHarness(h, hr)
                const defaultExpanded = state === 'working' || state === 'untested'
                const expanded = manualExpanded[h.name] ?? defaultExpanded
                return (
                  <HarnessRow
                    key={h.name}
                    harness={h}
                    result={hr}
                    state={state}
                    expanded={expanded}
                    onToggle={() => toggle(h.name, defaultExpanded)}
                    basePath={basePath}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="cf-legend">
        <span className="cf-legend-item">
          <span className="cf-badge cf-pass">Pass</span> Feature supported
          <InfoTip text={STATUS_DESCRIPTIONS.pass} />
        </span>
        <span className="cf-legend-item">
          <span className="cf-badge cf-fail">Fail</span> Feature failed
          <InfoTip text={STATUS_DESCRIPTIONS.fail} />
        </span>
        <span className="cf-legend-item">
          <span className="cf-badge cf-skip">Skip</span> Not applicable / skipped
          <InfoTip text={STATUS_DESCRIPTIONS.skip} />
        </span>
        <span className="cf-legend-item">
          <span className="cf-untested">-</span> Not yet tested
          <InfoTip text={STATUS_DESCRIPTIONS.untested} />
        </span>
      </div>

      <details className="cf-how-it-works">
        <summary>How the tests work</summary>
        <p>
          Each harness is launched as a subprocess. The server writes JSON-RPC commands to its stdin
          and reads JSON event lines from its stdout. For every feature the runner sends a specific
          command and waits up to 10 seconds for an event matching a predicate (e.g. <code>EventSessionState</code>
          with <code>state=running</code>, a non-empty <code>EventResult</code>, or an <code>EventError</code>).
          A match is a <strong>Pass</strong>; a wrong/missing event or timeout is a <strong>Fail</strong>; a harness
          that declares the feature unsupported yields a <strong>Skip</strong>. <code>discover</code> and <code>import</code>
          are exceptions — they run the binary with <code>-discover</code> / <code>-import-history</code> flags
          and inspect exit code and stdout rather than speaking the JSON-RPC protocol.
        </p>
      </details>
    </div>
  )
}

function HarnessRow({
  harness,
  result,
  state,
  expanded,
  onToggle,
  basePath,
}: {
  harness: HarnessInfo
  result?: ConformanceHarnessResult
  state: HarnessState
  expanded: boolean
  onToggle: () => void
  basePath: string
}) {
  const label = harness.label || HARNESS_LABEL[harness.name] || harness.name
  const emoji = harness.emoji || HARNESS_EMOJI[harness.name] || ''

  const nameCell = (
    <td className={`cf-td-harness-col cf-harness-state-${state}`} onClick={onToggle}>
      <span className="cf-expand-chevron" aria-label={expanded ? 'Collapse' : 'Expand'}>
        {expanded ? '▾' : '▸'}
      </span>
      {harness.image
        ? <img className="cf-harness-img" src={`${basePath}${harness.image}`} alt={label} />
        : <span className="cf-emoji">{emoji}</span>
      }
      <span className="cf-harness-label">{label}</span>
      <StateDot state={state} />
    </td>
  )

  if (!expanded) {
    const message = collapsedMessage(state, result)
    return (
      <tr className={`cf-row-collapsed cf-row-state-${state}`}>
        {nameCell}
        <td className="cf-td-collapsed-msg" colSpan={ALL_FEATURES.length} onClick={onToggle}>
          {message}
        </td>
        <td className="cf-td-summary-col">
          <SummaryCell result={result} />
        </td>
      </tr>
    )
  }

  return (
    <tr className={`cf-row-expanded cf-row-state-${state}`}>
      {nameCell}
      {ALL_FEATURES.map(feature => {
        const tr = result?.results?.find((r: ConformanceTestResult) => r.feature === feature)
        return (
          <td key={feature} className="cf-td-result" title={tr?.error || ''}>
            <CellBadge result={tr} tested={!!result} />
          </td>
        )
      })}
      <td className="cf-td-summary-col">
        <SummaryCell result={result} />
      </td>
    </tr>
  )
}

function collapsedMessage(state: HarnessState, result?: ConformanceHarnessResult): string {
  if (state === 'unavailable') return 'Binary not installed'
  if (state === 'broken' && result) {
    const total = result.summary.passed + result.summary.failed + result.summary.skipped
    return `0 / ${total} passing — click to expand`
  }
  if (state === 'untested') return 'Not yet tested — click to expand'
  return 'click to expand'
}

function StateDot({ state }: { state: HarnessState }) {
  const title =
    state === 'working' ? 'Working — at least one feature passing' :
    state === 'untested' ? 'Not yet tested' :
    state === 'broken' ? 'Broken — all features failing' :
    'Binary not installed'
  return <span className={`cf-state-dot cf-state-dot-${state}`} title={title} />
}

function SummaryCell({ result }: { result?: ConformanceHarnessResult }) {
  if (!result) return <span className="cf-untested">-</span>
  return (
    <span className="cf-summary-text">
      <span className="cf-sum-pass">{result.summary.passed}</span>
      {result.summary.failed > 0 && <> / <span className="cf-sum-fail">{result.summary.failed}</span></>}
      {result.summary.skipped > 0 && <> / <span className="cf-sum-skip">{result.summary.skipped}</span></>}
    </span>
  )
}

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  if (!text) return null

  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setCoords({ x: r.left + r.width / 2, y: r.bottom + 6 })
    setShow(true)
  }

  return (
    <>
      <span
        ref={ref}
        className="cf-info-icon"
        onMouseEnter={open}
        onMouseLeave={() => setShow(false)}
        onFocus={open}
        onBlur={() => setShow(false)}
        tabIndex={0}
        role="button"
        aria-label="More info"
      >?</span>
      {show && createPortal(
        <div className="cf-tooltip" style={{ left: coords.x, top: coords.y }} role="tooltip">
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}

function CellBadge({ result, tested }: { result?: ConformanceTestResult; tested: boolean }) {
  if (!tested) return <span className="cf-untested">-</span>
  if (!result) return <span className="cf-untested">-</span>
  if (result.skipped) return <span className="cf-badge cf-skip" title={result.error}>Skip</span>
  if (result.passed) return <span className="cf-badge cf-pass" title={result.duration}>Pass</span>
  return <span className="cf-badge cf-fail" title={result.error}>Fail</span>
}

function harnessKeyFromName(name: string): string {
  return name.replace(/_/g, '')
}
