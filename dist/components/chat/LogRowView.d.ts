import type { LogRow } from '../../types';
import type { TurnBlock } from './types';
export type ResolveHookFn = (input: {
    requestId: string;
    behavior: 'allow' | 'deny';
    updatedInput?: unknown;
    message?: string;
    resolvedBy?: string;
}) => Promise<void>;
export declare function LogRowView({ row, agent, onResolveHook }: {
    row: LogRow;
    agent: string;
    onResolveHook?: ResolveHookFn;
}): import("react/jsx-runtime").JSX.Element;
export declare function groupRowsByTurn(rows: LogRow[]): TurnBlock[];
export declare function TurnGroupView({ turnId, rows, agent, onResolveHook }: {
    turnId: string;
    rows: LogRow[];
    agent: string;
    onResolveHook?: ResolveHookFn;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=LogRowView.d.ts.map