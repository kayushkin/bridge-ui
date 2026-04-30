import type { SessionUIState } from '../../types'

export type StatusDotState = SessionUIState | 'placeholder' | 'compacting' | (string & {})

export function StatusDot({ state, title, className }: {
  state: StatusDotState
  title?: string
  className?: string
}) {
  return (
    <span
      className={`bc-status-dot bc-status-dot-${state}${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
    />
  )
}
