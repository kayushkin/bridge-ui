import { createContext, useContext } from 'react'
import type { ActivityKind, HookEvent, LogRow, SessionUIState } from '../../types'
import type { ChatSession, PaneKey, PaneSizes, PanesHidden } from './types'

// ResolveHookFn matches useBridgeSession's resolveHook signature; the
// banner uses it to settle pending awaiting_resolution events.
export type ResolveHookFn = (input: {
  requestId: string
  behavior: 'allow' | 'deny'
  updatedInput?: unknown
  message?: string
  resolvedBy?: string
}) => Promise<void>

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
  // True while a context compaction is in flight (set on request, cleared by
  // the harness's compact_boundary event). Drives the live "Compacting…"
  // indicator in TurnsView.
  compacting: boolean
  // Pty-related session state plumbed through the context so LayoutRenderer
  // (which lives inside WorkspaceProvider) doesn't have to call
  // useBridgeSession() — that hook isn't context-backed, so calling it
  // from a non-root component creates an independent state instance with
  // an empty activeSession, which would force-hide the attach pane.
  sessionMode?: string
  attachToken?: string
  // refreshAttachToken bridges to useBridgeSession's same-named action
  // so pane components inside the workspace can recover the token after
  // a page refresh without having to thread the bridge hook themselves
  // (the hook is per-call-state and creating a fresh instance has bitten
  // us — see WorkspaceContext.tsx commit 2b49c48 for why).
  refreshAttachToken?: (sessionId: string) => Promise<string | null>
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
  // Pending awaiting_resolution hooks for the active session — drives the
  // PendingPermissionsBanner. Empty array when nothing's pending.
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
