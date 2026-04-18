import type { ToolRendererProps } from './types'
import { registerToolRenderer } from './registry'

function BashRenderer({ tool, running }: ToolRendererProps) {
  const input = tool.input ?? {}
  const command = (input.command ?? input.cmd ?? '') as string

  return (
    <div className={`bc-tool-item ${tool.error ? 'bc-tool-item-error' : ''} ${running ? 'bc-tool-item-running' : ''}`}>
      <div className="bc-tool-header">
        <span className="bc-tool-name">⌨ bash</span>
        {running && <span className="bc-tool-spinner">⟳</span>}
        {tool.error && !running && <span className="bc-tool-error-badge">error</span>}
      </div>
      {command && <pre className="bc-tool-output-code">$ {command}</pre>}
      {tool.output && (
        <pre className="bc-tool-output-code" style={{ opacity: 0.8 }}>
          {tool.output.length > 800 ? tool.output.slice(0, 800) + '…' : tool.output}
        </pre>
      )}
    </div>
  )
}

registerToolRenderer('Bash', BashRenderer)
registerToolRenderer('bash', BashRenderer)

export default BashRenderer
