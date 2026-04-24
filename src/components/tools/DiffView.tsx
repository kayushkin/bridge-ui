import { structuredPatch, type Hunk } from 'diff'

// DiffView renders a single file's before/after as a unified-diff hunk list.
// Empty when the two sides match. Used by both EditRenderer (single file per
// tool call) and BashRenderer (one DiffView per file the bash command touched).
export function DiffView({ filePath, before, after }: { filePath: string; before: string; after: string }) {
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
