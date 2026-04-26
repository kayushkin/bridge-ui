import type { LogRow, LogRowActor, TokenUsage } from '../../types';
export interface StoreModel {
    id: string;
    name: string;
    provider: string;
    enabled: boolean;
    max_tokens: number;
    input_cost: number;
    output_cost: number;
}
export interface ChatSession {
    frontendId: string;
    sessionId: string | null;
    harness: string;
    agent: string;
    displayName: string;
}
export interface CollapseState {
    harnessBar: boolean;
    sessionList: boolean;
    turns: boolean;
    thread: boolean;
    timeline: boolean;
    git: boolean;
}
export type PaneKey = 'turns' | 'thread' | 'timeline' | 'git';
export type PaneSizes = Record<PaneKey, number>;
export interface SidebarSession {
    bridge_id: string;
    agent_id?: string;
    display_name: string;
    harness: string;
    state: string;
    updated_at: string;
    folder_name?: string;
}
export interface CtxMenuState {
    type: 'session' | 'folder';
    id: string;
    x: number;
    y: number;
}
export type TurnBlock = {
    kind: 'turn';
    turnId: string;
    rows: LogRow[];
} | {
    kind: 'standalone';
    row: LogRow;
};
export interface TurnsItem {
    key: string;
    actor: LogRowActor;
    text: string;
    ts: string;
    turnId?: string;
    usage?: TokenUsage;
    isError?: boolean;
}
export interface TimelineItem {
    key: string;
    turnId?: string;
    taskId?: string;
    icon: string;
    label: string;
    detail?: string;
    fullText?: string;
    ts: string;
    tone: 'turn' | 'thinking' | 'tool' | 'tool-done' | 'tool-err' | 'task' | 'task-start' | 'result' | 'error' | 'text';
}
export type ViewType = PaneKey;
export type InnerNode = {
    kind: 'leaf';
    viewType: ViewType;
} | {
    kind: 'split';
    direction: 'h' | 'v';
    children: InnerNode[];
};
//# sourceMappingURL=types.d.ts.map