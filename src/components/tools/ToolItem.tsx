import type { ToolEvent } from '../../types'
import { getToolRenderer } from './registry'
import DefaultRenderer from './DefaultRenderer'

export default function ToolItem({ tool, running }: { tool: ToolEvent; running: boolean }) {
  const Renderer = getToolRenderer(tool.tool) ?? DefaultRenderer
  return <Renderer tool={tool} running={running} />
}
