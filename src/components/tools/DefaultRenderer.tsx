import type { ToolRendererProps } from './types'

function formatDetail(input?: string): string {
  if (!input) return ''
  try {
    const parsed = JSON.parse(input)
    const keys = Object.keys(parsed).slice(0, 2)
    return keys.map(k => `${k}=${JSON.stringify(parsed[k]).slice(0, 30)}`).join(', ')
  } catch {
    return input.slice(0, 50)
  }
}

export default function DefaultRenderer({ tool, running }: ToolRendererProps) {
  const detail = formatDetail(tool.input)

  return (
    <div className={`bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`}>
      <div className="bc-tool-header">
        <span className="bc-tool-name">{tool.tool}</span>
        {detail && <span className="bc-tool-detail">{detail}</span>}
        {running && <span className="bc-tool-spinner">⟳</span>}
        {tool.error && !running && <span className="bc-tool-error-badge">error</span>}
      </div>
      {tool.output && (
        <div className="bc-tool-output">
          <span className="bc-tool-output-label">→</span>
          <span className="bc-tool-output-text">{tool.output}</span>
        </div>
      )}
    </div>
  )
}
