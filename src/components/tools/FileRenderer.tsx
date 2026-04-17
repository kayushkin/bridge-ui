import type { ToolRendererProps } from './types'
import { registerToolRenderer } from './registry'

function FileRenderer({ tool, running }: ToolRendererProps) {
  let path = ''
  let content = ''

  if (tool.input) {
    try {
      const parsed = JSON.parse(tool.input)
      path = parsed.path ?? parsed.file_path ?? parsed.file ?? ''
      content = parsed.content ?? parsed.new_string ?? parsed.new_text ?? ''
    } catch { /* ignore */ }
  }

  const label = tool.tool.replace(/_/g, ' ')
  const filename = path ? path.split('/').pop() : ''

  return (
    <div className={`bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`}>
      <div className="bc-tool-header">
        <span className="bc-tool-name">📄 {label}</span>
        {running && <span className="bc-tool-spinner">⟳</span>}
        {tool.error && !running && <span className="bc-tool-error-badge">error</span>}
      </div>
      {path && (
        <div className="bc-tool-detail" title={path}>
          {filename && <strong>{filename}</strong>}
          {filename !== path && <span style={{ opacity: 0.6, marginLeft: 4 }}>{path}</span>}
        </div>
      )}
      {content && !running && (
        <pre className="bc-tool-output-code">{content.length > 500 ? content.slice(0, 500) + '…' : content}</pre>
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

registerToolRenderer('write_file', FileRenderer)
registerToolRenderer('edit_file', FileRenderer)
registerToolRenderer('read_file', FileRenderer)
registerToolRenderer('Write', FileRenderer)
registerToolRenderer('Edit', FileRenderer)
registerToolRenderer('Read', FileRenderer)

export default FileRenderer
