import type { LogRow, LogRowActor, TokenUsage } from '../../types'

export interface StoreModel {
  id: string
  name: string
  provider: string
  enabled: boolean
  max_tokens: number
  input_cost: number
  output_cost: number
}

export interface ChatSession {
  sessionId: string | null
  harness: string
  agent: string
  displayName: string
}

export interface CollapseState {
  sessionList: boolean
  turns: boolean
  thread: boolean
  timeline: boolean
  git: boolean
}

export interface AppCollapseState {
  sessionList: boolean
}

// 'attach' is the pty terminal view. It's only meaningful for sessions
// running in pty mode; LayoutRenderer hides it whenever
// session.mode !== 'pty' regardless of the user's panesHidden choice.
export type PaneKey = 'turns' | 'thread' | 'timeline' | 'git' | 'kanban' | 'orchestrator' | 'attach'
export type PanesHidden = Record<PaneKey, boolean>
export type PaneSizes = Record<PaneKey, number>

export interface WorkspaceState {
  id: string
  sessionId: string | null
  // An unstarted "new chat": the composer is live but no server session
  // exists yet. Set only while sessionId is null; cleared the moment the
  // first message is sent (which creates the real session) or the pane is
  // retargeted to an existing session. Pending workspaces are never
  // persisted — a reload or a new window discards them, so an abandoned
  // new chat never leaves a dangling server session behind.
  pending?: { instanceId: string; harness: string }
  panesHidden: PanesHidden
  paneSizes: PaneSizes
  layout: InnerNode
}

export interface CtxMenuState {
  type: 'session' | 'folder'
  id: string
  x: number
  y: number
}

export type TurnBlock =
  | { kind: 'turn'; turnId: string; rows: LogRow[] }
  | { kind: 'standalone'; row: LogRow }

export interface TurnsItem {
  key: string
  actor: LogRowActor
  text: string
  ts: string
  turnId?: string
  usage?: TokenUsage
  isError?: boolean
  // True when the turn's assistant text arrived as streamed deltas rather
  // than in one final result. It says where the text came from, nothing
  // about whether the turn is still running — see isFinalAssistantTurn.
  hasStreamedText?: boolean
  isMarker?: boolean
  markerKind?: 'compact'
  thinking?: string
  narration?: string
  // A completion event (result / error) closed this turn. Reliable when
  // present and absent for about one turn in nine — never read it alone.
  turnDone?: boolean
  // The last assistant turn in the log. Every earlier turn is finished by
  // construction: another turn started after it.
  isFinalAssistantTurn?: boolean
}

export interface TimelineItem {
  key: string
  turnId?: string
  taskId?: string
  icon: string
  label: string
  detail?: string
  fullText?: string
  ts: string
  tone: 'turn' | 'thinking' | 'tool' | 'tool-done' | 'tool-err' | 'task' | 'task-start' | 'result' | 'error' | 'text'
}

// What Timeline windows over. `groupTimelineByTurn` groups CONSECUTIVE items
// sharing a turn id, so an item carrying none splits a turn into two blocks —
// see `timelineBlockKey` for why that matters.
export type TimelineBlock =
  | { kind: 'turn'; turnId: string; items: TimelineItem[] }
  | { kind: 'standalone'; item: TimelineItem }

export type ViewType = PaneKey

export type InnerNode =
  | { kind: 'leaf'; viewType: ViewType }
  | { kind: 'split'; direction: 'h' | 'v'; children: InnerNode[] }

export type WorkspaceLayoutNode =
  | { kind: 'leaf'; workspaceId: string }
  | { kind: 'split'; direction: 'h' | 'v'; children: WorkspaceLayoutNode[]; sizes: number[] }

export type SplitMode =
  | 'replace'
  | 'split-auto'
  | 'split-left'
  | 'split-right'
  | 'split-up'
  | 'split-down'

export function splitModeAxis(mode: SplitMode): { axis: 'h' | 'v'; position: 'before' | 'after' } | null {
  switch (mode) {
    case 'split-left':  return { axis: 'h', position: 'before' }
    case 'split-right': return { axis: 'h', position: 'after' }
    case 'split-up':    return { axis: 'v', position: 'before' }
    case 'split-down':  return { axis: 'v', position: 'after' }
    default: return null
  }
}
