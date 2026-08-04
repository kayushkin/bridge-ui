import type { BridgeEvent, ManagedSession, SessionUIState, ActivityKind, LogRow, UseBridgeSessionReturn } from './types';
export declare function applyEventToRows(rows: LogRow[], ev: BridgeEvent): LogRow[];
export declare function sameActivity(a: ActivityKind, b: ActivityKind): boolean;
export declare function controlRefusal(res: {
    ok: boolean;
    status: number;
    statusText: string;
    text(): Promise<string>;
}): Promise<string | null>;
export declare function projectServerSessionState(session: ManagedSession): SessionUIState;
export declare function useBridgeSession(): UseBridgeSessionReturn;
//# sourceMappingURL=useBridgeSession.d.ts.map