import type { LogRow } from '../../types';
export declare function Thread({ rows, loading, uiState, activity, error, agent, sessionId }: {
    rows: LogRow[];
    loading: boolean;
    uiState: string;
    activity: {
        kind: string;
        name?: string;
    };
    error: string | null;
    agent: string;
    sessionId: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Thread.d.ts.map