import type { TokenUsage, Cost, Instance, InstanceCredential, InstanceStatus, ManagedSession, HarnessInfo, HarnessDefaults, BridgePrefs, MaterializedMessage, MaterializedTool, ResultEvent, SessionInfo, ToolInfo, MCPServerInfo } from '@kayushkin/llm-bridge-types';
export type { TokenUsage, Cost, InstanceCredential, InstanceStatus, ManagedSession, HarnessInfo, HarnessDefaults, BridgePrefs, MaterializedMessage, MaterializedTool, ResultEvent, SessionInfo, ToolInfo, MCPServerInfo, };
export type { Instance as BridgeInstance };
export type { ManagedSession as BridgeSession };
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>;
export interface ToolEvent {
    tool: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: boolean;
}
export interface MessageMeta {
    text?: string;
    is_error?: boolean;
    usage?: TokenUsage;
    cost?: Cost;
    duration_ms?: number;
    duration_api_ms?: number;
    num_turns?: number;
    api_calls?: number;
    model?: string;
    api_call_usages?: TokenUsage[];
    tool_events?: ToolEvent[];
    tools?: ToolEvent[];
    toolCalls?: number;
    rawStats?: Record<string, unknown>;
}
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    thinking?: string;
    tools?: ToolEvent[];
    meta?: MessageMeta;
    raw?: Record<string, unknown>;
    done?: boolean;
    id?: string;
    orchestrator?: string;
    agent?: string;
    sessionId?: string;
}
export type SessionUIState = 'empty' | 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'aborted';
export type ActivityKind = {
    kind: 'idle';
} | {
    kind: 'thinking';
} | {
    kind: 'streaming';
} | {
    kind: 'tool';
    name: string;
};
export interface BridgeEvent {
    id?: string;
    type: string;
    data: Record<string, unknown>;
}
export interface CreateSessionOpts {
    harness: string;
    instanceId: string;
    agentId: string;
    displayName: string;
    clientId?: string;
}
export interface UseBridgeSessionReturn {
    sessions: ManagedSession[];
    activeSession: ManagedSession | null;
    messages: Message[];
    uiState: SessionUIState;
    activity: ActivityKind;
    connected: boolean;
    error: string | null;
    loadingHistory: boolean;
    createSession: (opts: CreateSessionOpts) => Promise<ManagedSession | null>;
    selectSession: (id: string) => void;
    send: (text: string) => void;
    interrupt: () => void;
    resume: () => void;
    stop: () => void;
    compact: (summary?: string) => void;
    fork: (displayName?: string) => void;
    renameSession: (bridgeID: string, displayName: string) => Promise<void>;
    sendConfig: (config: {
        model?: string;
        effort?: string;
        disabled_tools?: string[];
        max_budget?: number;
    }) => void;
    refreshSessions: () => void;
}
//# sourceMappingURL=types.d.ts.map