import type { TokenUsage, Cost, Event, Instance, InstanceCredential, InstanceStatus, Machine, ManagedSession, HarnessInfo, HarnessDefaults, BridgePrefs, MaterializedMessage, MaterializedTool, ResultEvent, SessionInfo, ToolInfo, MCPServerInfo, HookEvent, HookResolution, APICallEvent, APISpendTotalEvent, CreateSessionRequest, CreateMachineRequest, UpdateMachineRequest, Signal, SignalAnswer, SignalOption } from '@kayushkin/llm-bridge-types';
export { ErrCodeBudgetExceeded, HookSourceHook, HookSourcePermission, HookSourceUserInput, PermissionModeAsk, PermissionModeAskAll, PermissionModeAuto, PermissionModeBlockAll, PermissionModeBypass, PermissionModeCustom, PermissionModePlan, PermissionModeRead, SignalKindNotification, SignalKindQuestion, SignalSeverityInfo, SignalSeverityWarn, SignalSourceDerived, SignalSourceTool, SignalStateAcknowledged, SignalStateAnswered, SignalStateDismissed, SignalStateOpen, SignalSurfaceChat, SignalSurfaceKanban, } from '@kayushkin/llm-bridge-types';
export type { TokenUsage, Cost, Event, InstanceCredential, InstanceStatus, Machine, ManagedSession, HarnessInfo, HarnessDefaults, BridgePrefs, MaterializedMessage, MaterializedTool, ResultEvent, SessionInfo, ToolInfo, MCPServerInfo, HookEvent, HookResolution, APICallEvent, APISpendTotalEvent, CreateSessionRequest, CreateMachineRequest, UpdateMachineRequest, Signal, SignalAnswer, SignalOption, };
export type { Instance as BridgeInstance };
export type { ManagedSession as BridgeSession };
export type FetchFn = (url: string, opts?: RequestInit) => Promise<Response>;
export interface ToolEvent {
    tool_id: string;
    tool: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: boolean;
}
export type MessageMeta = Partial<ResultEvent> & {
    tools?: ToolEvent[];
    toolCalls?: number;
    rawStats?: Record<string, unknown>;
};
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
    clientId?: string;
    harnessMessageId?: string;
    lastEventRowId?: number;
    orchestrator?: string;
    agent?: string;
    sessionId?: string;
}
export type LogRowActor = 'user' | 'assistant' | 'system';
export type LogRowKind = 'user_message' | 'text' | 'thinking' | 'tool' | 'result' | 'error' | 'system' | 'session_state' | 'session_info' | 'plan' | 'approval' | 'hook' | 'stream' | 'block' | 'api_call' | 'api_spend_total' | 'usage_total' | 'turn_complete' | 'other';
export interface LogRow {
    key: string;
    clientId?: string;
    clientRequestId?: string;
    turnId?: string;
    messageId?: string;
    harnessMessageId?: string;
    toolUseId?: string;
    eventIds: number[];
    actor: LogRowActor;
    kind: LogRowKind;
    eventType: string;
    subtype?: string;
    timestamp: string;
    text?: string;
    thinking?: string;
    tools?: ToolEvent[];
    usage?: TokenUsage;
    meta?: MessageMeta;
    systemMessage?: string;
    systemFields?: Record<string, unknown>;
    stateTransition?: {
        from?: string;
        to: string;
        reason?: string;
    };
    sessionInfo?: SessionInfo;
    errorMessage?: string;
    hook?: HookEvent;
    apiCall?: APICallEvent;
    apiSpendTotal?: APISpendTotalEvent;
    events: Array<Record<string, unknown>>;
    done?: boolean;
}
export type SessionUIState = 'empty' | 'placeholder' | 'starting' | 'model_generating' | 'tool_running' | 'compacting' | 'awaiting_permission' | 'awaiting_user' | 'rate_limited' | 'paused' | 'idle' | 'completed' | 'error' | 'aborted' | 'disconnected' | 'running' | 'waiting_on_approval';
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
export type EventData = Event & {
    event_id?: number;
};
export interface BridgeEvent {
    id?: string;
    type: string;
    data: EventData;
}
export interface BudgetHalt {
    /** Bridge session id the halt belongs to. A halt never outlives its own
     * session: switching sessions clears it. */
    sessionId: string;
    /** The server's own description of the halt. Always present. */
    message: string;
    /** Spend recorded against the ceiling at the moment of refusal, in USD.
     * Undefined when the halt came from the mid-turn error event. */
    spendUSD?: number;
    /** The ceiling that was breached, in USD. Undefined when the halt came
     * from the mid-turn error event. */
    maxBudgetUSD?: number;
}
export interface UseBridgeSessionReturn {
    sessions: ManagedSession[];
    activeSession: ManagedSession | null;
    logRows: LogRow[];
    uiState: SessionUIState;
    getSessionUIState: (session: ManagedSession) => SessionUIState;
    activity: ActivityKind;
    connected: boolean;
    compacting: boolean;
    error: string | null;
    loadingHistory: boolean;
    createSession: (opts: Partial<CreateSessionRequest> & Pick<CreateSessionRequest, 'harness'>) => Promise<ManagedSession | null>;
    selectSession: (id: string) => void;
    attachTokens: Record<string, string>;
    switchMode: (sessionId: string, mode: 'events' | 'pty') => Promise<string | null>;
    refreshAttachToken: (sessionId: string) => Promise<string | null>;
    send: (text: string, explicitSessionId?: string) => void;
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
    }, explicitSessionId?: string) => void;
    refreshSessions: () => void;
    budgetHalt: BudgetHalt | null;
    raiseBudgetCeiling: (maxBudgetUSD: number, explicitSessionId?: string) => Promise<string | null>;
    pendingHooks: HookEvent[];
    resolveHook: (input: {
        requestId: string;
        behavior: 'allow' | 'deny';
        updatedInput?: unknown;
        message?: string;
        resolvedBy?: string;
    }) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map