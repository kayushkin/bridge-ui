import { useCallback, useEffect, useState } from 'react'
import { useBridgeConfig } from '../../context'
import type { BridgeRoutes } from '../../context'

// Compact in-chat view of the orchestrator's injected context. The full review
// surface (WAL, prior versions, filters) lives on the host's own orchestrator
// page, wherever `routes.orchestrator` says; this pane is the at-a-glance "what
// would the orchestrator see right now" with per-part token counts, as an
// optional split alongside the chat.

interface Version { part: string; title: string; content: string; tokens: number }
interface PartState { part: string; title: string; latest: Version; version_count: number }

const ORDER = ['agents', 'tasks', 'convo_summary', 'convo_current']
const LINK_RE = /\[(session|task|todo):([^\]]+)\]/g

// Where a [kind:id] reference points on THIS host. Every path comes from the
// consumer's `routes`, never from a literal: the same panel runs in a host that
// mounts chat at `/` and in one that mounts it at `/bridge`. An empty route
// means the host has no such page, and the reference renders as plain text
// rather than as a link to somewhere that doesn't exist.
function hrefFor(routes: BridgeRoutes, kind: string, id: string): string {
  if (kind === 'session') return `${routes.chat}?session=${encodeURIComponent(id)}`
  if (kind === 'task') return routes.kanban
  if (kind === 'todo') return routes.notes
  return ''
}

function Linkified({ text, routes }: { text: string; routes: BridgeRoutes }) {
  const out: React.ReactNode[] = []
  let last = 0, i = 0, m: RegExpExecArray | null
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [tok, kind, id] = m
    const href = hrefFor(routes, kind, id)
    out.push(href
      ? <a key={i++} href={href} style={{ color: 'var(--accent,#818cf8)' }}>{tok}</a>
      : <span key={i++}>{tok}</span>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

export function OrchestratorPanel({ onToggleCollapse, style }: {
  onToggleCollapse: () => void
  style?: React.CSSProperties
}) {
  const { fetch: apiFetch, producerBasePath, routes } = useBridgeConfig()
  const [parts, setParts] = useState<PartState[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!producerBasePath) return
    try {
      const r = await apiFetch(`${producerBasePath}/context`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setParts(await r.json()); setError(null)
    } catch (e) { setError(String((e as Error).message ?? e)) }
  }, [apiFetch, producerBasePath])

  useEffect(() => {
    if (!producerBasePath) return
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load, producerBasePath])

  const ordered = [
    ...ORDER.map(id => parts.find(p => p.part === id)).filter(Boolean) as PartState[],
    ...parts.filter(p => !ORDER.includes(p.part)),
  ]
  const total = ordered.reduce((a, p) => a + (p.latest?.tokens ?? 0), 0)

  return (
    <div className="bc-split-pane" style={style} data-pane="orchestrator">
      <div
        className="bc-split-pane-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() } }}
        role="button"
        tabIndex={0}
        title="Hide orchestrator context"
      >
        <span className="bc-split-pane-title">🎬 Orchestrator context</span>
        <span className="bc-spacer" />
        <span style={{ fontSize: 12, opacity: 0.7 }}>~{total.toLocaleString()} tok</span>
        {routes.orchestrator && (
          <a href={routes.orchestrator} onClick={e => e.stopPropagation()} title="Open full review page" style={{ marginLeft: 8, textDecoration: 'none' }}>↗</a>
        )}
        <span className="bc-split-collapse-btn" aria-hidden="true" style={{ marginLeft: 8 }}>×</span>
      </div>
      <div style={{ overflow: 'auto', padding: 8, fontSize: 12 }}>
        {!producerBasePath && <div style={{ opacity: 0.7 }}>No producer configured — set producerBasePath on BridgeProvider.</div>}
        {error && <div style={{ color: '#ef4444' }}>Producer offline ({error})</div>}
        {ordered.map(p => (
          <details key={p.part} open={p.part === 'agents' || p.part === 'tasks'} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', opacity: 0.85 }}>
              {p.title} <span style={{ opacity: 0.5 }}>· ~{p.latest.tokens.toLocaleString()} tok · v{p.version_count}</span>
            </summary>
            <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 11.5 }}><Linkified text={p.latest.content} routes={routes} /></pre>
          </details>
        ))}
      </div>
    </div>
  )
}
