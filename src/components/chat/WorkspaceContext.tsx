import { createContext, useContext } from 'react'
import type { ActivityKind, HookEvent, LogRow, SessionUIState } from '../../types'
import type { ChatSession, PaneKey, PaneSizes, PanesHidden } from './types'
import type { ResolveHookFn } from './LogRowView'

export interface GitRepo {
  path: string
  name: string
}

export interface WorkspaceValue {
  chat: ChatSession | null
  rows: LogRow[]
  loading: boolean
  uiState: SessionUIState
  activity: ActivityKind
  error: string | null
  panesHidden: PanesHidden
  paneSizes: PaneSizes
  togglePane: (key: PaneKey) => void
  setPaneSizes: React.Dispatch<React.SetStateAction<PaneSizes>>
  // Git repos discovered for the active session — shared between SessionHeader's
  // dropdown and GitPanel so both reflect the same selection.
  gitRepos: GitRepo[]
  selectedRepo: string
  setSelectedRepo: (path: string) => void
  gitReposLoading: boolean
  gitReposError: string | null
  refreshGitRepos: () => void
  // Permission / approval hooks awaiting human decision for the active
  // session. Drives the inline allow/deny UI inside Thread/Turns.
  pendingHooks: HookEvent[]
  resolveHook: ResolveHookFn
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
