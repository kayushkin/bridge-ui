import type { LogRow } from '../../types';
import { type ResolveHookFn } from './LogRowView';
export declare function Thread({ rows, loading, error, agent, sessionId, onResolveHook }: {
    rows: LogRow[];
    loading: boolean;
    error: string | null;
    agent: string;
    sessionId: string;
    onResolveHook?: ResolveHookFn;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Thread.d.ts.map