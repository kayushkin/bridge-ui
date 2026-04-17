// Import renderers to trigger self-registration
import './FileRenderer'
import './BashRenderer'
import './GrepRenderer'
import './WebRenderer'

export type { ToolRendererProps } from './types'
export { getToolRenderer, registerToolRenderer } from './registry'
export { default as DefaultRenderer } from './DefaultRenderer'
export { default as ToolItem } from './ToolItem'
