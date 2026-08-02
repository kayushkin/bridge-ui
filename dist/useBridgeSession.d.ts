import type { BridgeEvent, ManagedSession, SessionUIState, ActivityKind, LogRow, UseBridgeSessionReturn } from './types';
export declare function applyEventToRows(rows: LogRow[], ev: BridgeEvent): LogRow[];
export declare function sameActivity(a: ActivityKind, b: ActivityKind): boolean;
export declare function deriveSessionUIState(session: ManagedSession, interrupted: Set<string>): SessionUIState;
export declare function useBridgeSession(): UseBridgeSessionReturn;
//# sourceMappingURL=useBridgeSession.d.ts.map