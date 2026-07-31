import type { LogRow } from '../../types';
import type { TurnsItem } from './types';
export declare function dedupOTelAssistantRows(rows: LogRow[]): LogRow[];
export declare function rowsToTurns(inputRows: LogRow[]): TurnsItem[];
export declare function TurnsView({ rows, agent, compacting, harnessWorking, onToggleCollapse, style, paneKey }: {
    rows: LogRow[];
    agent: string;
    compacting?: boolean;
    harnessWorking?: boolean;
    onToggleCollapse: () => void;
    style?: React.CSSProperties;
    paneKey?: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TurnsView.d.ts.map