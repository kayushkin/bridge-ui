import type { LogRow, SessionUIState, ToolEvent } from '../../types'

// The states in which the harness holds the turn and more of it is still
// coming. Everything else — the quiet states (idle, awaiting_user, paused),
// the waits that need a human or a clock (awaiting_permission,
// rate_limited), and the terminal ones (completed, error, aborted) — means
// no further assistant output arrives without a fresh action, so whatever
// the last turn looks like in the log, nothing is being produced for it now.
// Those waits have their own surfaces (the permission banner, the status
// chip); a "streaming…" badge during them would say something untrue.
const workingStates = new Set<SessionUIState>([
  'starting',
  'model_generating',
  'tool_running',
  'compacting',
])

export function harnessIsWorkingOnTurn(state: SessionUIState): boolean {
  return workingStates.has(state)
}

export function formatHMS(ts: string): string {
  try {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch { return ts }
}

export function idTail(id: string, n = 10): string {
  return id.length > n ? `…${id.slice(-n)}` : id
}

export function oneLine(s: string, n = 120): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > n ? flat.slice(0, n) + '…' : flat
}

export function renderValue(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return `${v}`
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export function flattenToRows(obj: Record<string, unknown>, prefix = ''): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  for (const [key, val] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${key}` : key
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      rows.push(...flattenToRows(val as Record<string, unknown>, label))
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const item = val[i]
        if (item != null && typeof item === 'object') {
          rows.push(...flattenToRows(item as Record<string, unknown>, `${label}[${i}]`))
        } else {
          rows.push([`${label}[${i}]`, renderValue(item)])
        }
      }
    } else {
      rows.push([label, renderValue(val)])
    }
  }
  return rows
}

export function shouldExpandByDefault(row: LogRow): boolean {
  if (row.actor === 'user') return true
  if (row.kind === 'text' && row.text) return true
  return !!row.meta || row.kind === 'result'
}

export function groupEventsByType(events: Array<Record<string, unknown>>): Array<{ type: string; events: Array<Record<string, unknown>> }> {
  const order: string[] = []
  const buckets: Record<string, Array<Record<string, unknown>>> = {}
  for (const e of events) {
    const t = String((e as { type?: unknown }).type ?? 'unknown') || 'unknown'
    if (!(t in buckets)) { buckets[t] = []; order.push(t) }
    buckets[t].push(e)
  }
  return order.map(t => ({ type: t, events: buckets[t] }))
}

export function typesInRow(row: LogRow): string[] {
  return [row.kind]
}

export function formatTodoWrite(todos: unknown): string | undefined {
  if (!Array.isArray(todos)) return undefined
  let done = 0
  let active = 0
  let pending = 0
  let current: string | undefined
  for (const raw of todos) {
    if (!raw || typeof raw !== 'object') continue
    const t = raw as { status?: string; content?: string; activeForm?: string }
    if (t.status === 'completed') done++
    else if (t.status === 'in_progress') { active++; current = t.activeForm || t.content || current }
    else pending++
  }
  const total = todos.length
  const bits: string[] = [`${total} todo${total === 1 ? '' : 's'}`]
  const counts: string[] = []
  if (done) counts.push(`${done}✓`)
  if (active) counts.push(`${active}⏺`)
  if (pending) counts.push(`${pending}○`)
  if (counts.length) bits.push(`(${counts.join(' ')})`)
  if (current) bits.push(`— ${oneLine(current, 60)}`)
  return bits.join(' ')
}

export function toolSnippet(t: ToolEvent): string {
  if (!t.input) return ''
  const keys = Object.keys(t.input)
  if (keys.length === 0) return ''
  if (t.tool === 'TodoWrite') {
    const summary = formatTodoWrite(t.input.todos)
    if (summary) return summary
  }
  const preferred = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']
  for (const k of preferred) {
    const v = t.input[k]
    if (typeof v === 'string' && v) return `${k}=${oneLine(v, 80)}`
  }
  const first = t.input[keys[0]]
  if (typeof first === 'string') return `${keys[0]}=${oneLine(first, 80)}`
  if (Array.isArray(first)) return `${keys[0]}[${first.length}]`
  return keys.join(',')
}

export function toolFullText(t: ToolEvent): string | undefined {
  if (!t.input) return undefined
  try { return JSON.stringify(t.input, null, 2) } catch { return undefined }
}
