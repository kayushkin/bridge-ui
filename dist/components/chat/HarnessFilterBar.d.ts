import type { HarnessInfo, Machine, ManagedSession, SessionUIState } from '../../types';
export declare const MODE_DEFAULT = "events";
export declare function sessionMode(s: {
    mode?: string;
}): string;
export type SessionStatusGroup = 'active' | 'needs you' | 'waiting' | 'idle' | 'done' | 'error';
export declare function sessionStatusGroup(uiState: SessionUIState | string): SessionStatusGroup | '';
type ClassDim = 'type' | 'purpose' | 'mode' | 'status';
interface HarnessFilterBarProps {
    machines: Machine[];
    harnesses: HarnessInfo[];
    sessions: ManagedSession[];
    instanceMachineByID: Map<string, string>;
    excludedHarnesses: Set<string>;
    excludedMachines: Set<string>;
    excludedTypes: Set<string>;
    excludedPurposes: Set<string>;
    excludedModes: Set<string>;
    excludedStatuses: Set<string>;
    statusOf: (s: ManagedSession) => string;
    onToggleHarness: (harness: string) => void;
    onToggleMachine: (machineId: string) => void;
    onToggleClass: (dim: ClassDim, value: string) => void;
    onClear: () => void;
    basePath: string;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}
export declare function HarnessFilterBar({ machines, harnesses, sessions, instanceMachineByID, excludedHarnesses, excludedMachines, excludedTypes, excludedPurposes, excludedModes, excludedStatuses, statusOf, onToggleHarness, onToggleMachine, onToggleClass, onClear, basePath, collapsed, onToggleCollapsed, }: HarnessFilterBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=HarnessFilterBar.d.ts.map