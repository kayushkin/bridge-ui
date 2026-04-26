import type { LogRow, ToolEvent } from '../../types';
export declare function generateFrontendId(): string;
export declare function formatHMS(ts: string): string;
export declare function idTail(id: string, n?: number): string;
export declare function oneLine(s: string, n?: number): string;
export declare function renderValue(v: unknown): string;
export declare function flattenToRows(obj: Record<string, unknown>, prefix?: string): Array<[string, string]>;
export declare function shouldExpandByDefault(row: LogRow): boolean;
export declare function groupEventsByType(events: Array<Record<string, unknown>>): Array<{
    type: string;
    events: Array<Record<string, unknown>>;
}>;
export declare function typesInRow(row: LogRow): string[];
export declare function formatTodoWrite(todos: unknown): string | undefined;
export declare function toolSnippet(t: ToolEvent): string;
export declare function toolFullText(t: ToolEvent): string | undefined;
//# sourceMappingURL=utils.d.ts.map