import { useEffect, useState } from 'react'
import { structuredPatch, type Hunk } from 'diff'
import type { ToolRendererProps } from './types'
import { registerToolRenderer } from './registry'
import { useToolContext } from './context'
import { useBridgeConfig } from '../../context'

// Server response for GET /sessions/{id}/tools/{tool_use_id}/snapshots.
// Either phase may be absent if snapshotting didn't fire (the UI falls
// back to the Edit fast path in that case).
interface SnapshotMeta {
  phase: 'before' | 'after'
  file_path: string
  size: number
  blob_sha?: string
  blob_url?: string
  is_binary?: boolean
  too_large?: boolean
  missing?: boolean
}

interface SnapshotsResponse {
  before: SnapshotMeta | null
  after: SnapshotMeta | null
}

interface Side {
  label: string
  content: string
  meta?: SnapshotMeta
}

// EditRenderer handles both `Edit` and `Write` tool calls. There are two
// paths:
//   1. Fast path: the tool input carries the full diff payload already
//      (old_string / new_string for Edit; content for Write when the before
//      was missing). No fetch required.
//   2. Fetch path: ask the bridge server for before/after snapshots keyed
//      by tool_use_id and render the diff from the blob contents.
// Fast path runs unconditionally whenever the inputs are present, which
// also covers the case where snapshot capture never ran (no hook).
function EditRenderer({ tool, running }: ToolRendererProps) {
  const { sessionId } = useToolContext()
  const { fetch: fetchFn, basePath } = useBridgeConfig()

  const input = (tool.input ?? {}) as Record<string, unknown>
  const filePath = (input.file_path ?? input.path ?? '') as string
  const isEdit = tool.tool === 'Edit'
  const isWrite = tool.tool === 'Write'

  const fastBefore = isEdit ? (input.old_string as string | undefined) : undefined
  const fastAfter = isEdit
    ? (input.new_string as string | undefined)
    : isWrite
      ? (input.content as string | undefined)
      : undefined
  const haveFastPath = typeof fastBefore === 'string' && typeof fastAfter === 'string'
  // For Write, before-state only exists in snapshots — the tool input has
  // no old content field.
  const needsFetch = !running && tool.tool_id !== '' && (!haveFastPath || isWrite)

  const [sides, setSides] = useState<{ before: Side; after: Side } | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [hint, setHint] = useState<string>('')

  useEffect(() => {
    if (!needsFetch || !sessionId) return
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const res = await fetchFn(`${basePath}/sessions/${sessionId}/tools/${tool.tool_id}/snapshots`)
        if (!res.ok) throw new Error(`snapshots ${res.status}`)
        const meta = (await res.json()) as SnapshotsResponse

        const beforeSide = await loadSide(fetchFn, basePath, 'Before', meta.before, fastBefore)
        const afterSide = await loadSide(fetchFn, basePath, 'After', meta.after, fastAfter)
        if (cancelled) return

        const degraded = sidesHint(meta.before, meta.after)
        setSides({ before: beforeSide, after: afterSide })
        setHint(degraded)
        setState('ready')
      } catch (err) {
        if (cancelled) return
        setState('error')
        setHint(String(err))
      }
    })()
    return () => { cancelled = true }
  }, [needsFetch, sessionId, tool.tool_id, fetchFn, basePath, fastBefore, fastAfter])

  const label = tool.tool
  const filename = filePath ? filePath.split('/').pop() : ''

  // Pick whichever content we have. Fast path wins when fetch wasn't needed
  // (or hasn't landed yet) because it's instant and still accurate.
  const before = sides?.before.content ?? fastBefore ?? ''
  const after = sides?.after.content ?? fastAfter ?? ''
  const showDiff = (haveFastPath && !isWrite) || state === 'ready'

  return (
    <div className={`bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`}>
      <div className="bc-tool-header">
        <span className="bc-tool-name">📝 {label}</span>
        {running && <span className="bc-tool-spinner">⟳</span>}
        {tool.error && !running && <span className="bc-tool-error-badge">error</span>}
      </div>
      {filePath && (
        <div className="bc-tool-detail" title={filePath}>
          {filename && <strong>{filename}</strong>}
          {filename !== filePath && <span style={{ opacity: 0.6, marginLeft: 4 }}>{filePath}</span>}
        </div>
      )}
      {running && <div className="bc-tool-output-code" style={{ opacity: 0.6 }}>Applying…</div>}
      {!running && state === 'loading' && !haveFastPath && (
        <div className="bc-tool-output-code" style={{ opacity: 0.6 }}>Loading snapshot…</div>
      )}
      {!running && state === 'error' && (
        <div className="bc-tool-output-code" style={{ opacity: 0.7 }}>Snapshot unavailable: {hint}</div>
      )}
      {!running && showDiff && (
        <DiffView filePath={filePath} before={before} after={after} />
      )}
      {hint && state === 'ready' && (
        <div className="bc-tool-output-code" style={{ opacity: 0.6 }}>{hint}</div>
      )}
      {tool.output && (
        <div className="bc-tool-output">
          <span className="bc-tool-output-label">→</span>
          <span className="bc-tool-output-text">{tool.output}</span>
        </div>
      )}
    </div>
  )
}

function DiffView({ filePath, before, after }: { filePath: string; before: string; after: string }) {
  if (before === after) {
    return <div className="bc-tool-output-code" style={{ opacity: 0.6 }}>No changes</div>
  }
  const patch = structuredPatch(filePath || 'file', filePath || 'file', before, after, '', '', { context: 3 })
  if (patch.hunks.length === 0) {
    return <div className="bc-tool-output-code" style={{ opacity: 0.6 }}>No changes</div>
  }
  return (
    <pre className="bc-diff">
      {patch.hunks.map((h, i) => <HunkView key={i} hunk={h} />)}
    </pre>
  )
}

function HunkView({ hunk }: { hunk: Hunk }) {
  return (
    <div className="bc-diff-hunk">
      <div className="bc-diff-hunk-header">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      {hunk.lines.map((line, i) => {
        const cls = line.startsWith('+')
          ? 'bc-diff-add'
          : line.startsWith('-')
            ? 'bc-diff-del'
            : 'bc-diff-ctx'
        return <div key={i} className={cls}>{line}</div>
      })}
    </div>
  )
}

async function loadSide(
  fetchFn: (url: string, opts?: RequestInit) => Promise<Response>,
  basePath: string,
  label: string,
  meta: SnapshotMeta | null,
  fallback: string | undefined,
): Promise<Side> {
  if (!meta) {
    return { label, content: fallback ?? '' }
  }
  if (meta.missing || meta.is_binary || meta.too_large || !meta.blob_url) {
    return { label, content: fallback ?? '', meta }
  }
  const res = await fetchFn(`${basePath}${meta.blob_url}`)
  if (!res.ok) throw new Error(`blob ${res.status}`)
  const text = await res.text()
  return { label, content: text, meta }
}

// sidesHint surfaces side-specific degradations (binary, oversized, new
// file) so the UI can explain why a half of the diff is empty.
function sidesHint(before: SnapshotMeta | null, after: SnapshotMeta | null): string {
  const parts: string[] = []
  if (before?.missing) parts.push('new file')
  if (before?.is_binary || after?.is_binary) parts.push('binary file')
  if (before?.too_large || after?.too_large) parts.push('file exceeds size cap')
  return parts.join(' · ')
}

registerToolRenderer('Edit', EditRenderer)
registerToolRenderer('Write', EditRenderer)

export default EditRenderer
