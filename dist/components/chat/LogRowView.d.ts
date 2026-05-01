import type { LogRow } from '../../types';
import type { TurnBlock } from './types';
export declare function LogRowView({ row, agent }: {
    row: LogRow;
    agent: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function groupRowsByTurn(rows: LogRow[]): TurnBlock[];
export declare function TurnGroupView({ turnId, rows, agent }: {
    turnId: string;
    rows: LogRow[];
    agent: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=LogRowView.d.ts.map