import { createContext, useContext } from 'react'
import type { ActivityKind, LogRow, SessionUIState } from '../../types'
import type { ChatSession, CollapseState, PaneKey, PaneSizes } from './types'

export interface WorkspaceValue {
  chat: ChatSession | null
  rows: LogRow[]
  loading: boolean
  uiState: SessionUIState
  activity: ActivityKind
  error: string | null
  collapseState: CollapseState
  paneSizes: PaneSizes
  togglePane: (key: PaneKey) => void
  setPaneSizes: React.Dispatch<React.SetStateAction<PaneSizes>>
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be called inside WorkspaceProvider')
  return ctx
}

export function WorkspaceProvider({ value, children }: {
  value: WorkspaceValue
  children: React.ReactNode
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
