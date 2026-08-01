import type { LogRow } from '../../types';
import type { TurnBlock } from './types';
export declare const LogRowView: import("react").NamedExoticComponent<{
    row: LogRow;
    agent: string;
}>;
export declare function groupRowsByTurn(rows: LogRow[]): TurnBlock[];
export declare const TurnGroupView: import("react").NamedExoticComponent<{
    turnId: string;
    rows: LogRow[];
    agent: string;
}>;
//# sourceMappingURL=LogRowView.d.ts.map