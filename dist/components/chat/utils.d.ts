import type { SessionUIState } from '../../types';
export declare function harnessIsWorkingOnTurn(state: SessionUIState): boolean;
export declare function sessionCanBeResumed(state: SessionUIState): boolean;
export declare function idTail(id: string, n?: number): string;
export declare function flattenToRows(obj: Record<string, unknown>, prefix?: string): Array<[string, string]>;
//# sourceMappingURL=utils.d.ts.map