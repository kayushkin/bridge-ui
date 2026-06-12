import type { HarnessInfo, Machine } from '../../types';
export declare const MODE_DEFAULT = "events";
export declare function sessionMode(s: {
    mode?: string;
}): string;
type ClassDim = 'type' | 'purpose' | 'mode';
interface HarnessFilterBarProps {
    machines: Machine[];
    harnesses: HarnessInfo[];
    sessions: Array<{
        harness: string;
        instance_id?: string;
        type?: string;
        purpose?: string;
        mode?: string;
    }>;
    instanceMachineByID: Map<string, string>;
    excludedHarnesses: Set<string>;
    excludedMachines: Set<string>;
    excludedTypes: Set<string>;
    excludedPurposes: Set<string>;
    excludedModes: Set<string>;
    onToggleHarness: (harness: string) => void;
    onToggleMachine: (machineId: string) => void;
    onToggleClass: (dim: ClassDim, value: string) => void;
    onClear: () => void;
    basePath: string;
}
export declare function HarnessFilterBar({ machines, harnesses, sessions, instanceMachineByID, excludedHarnesses, excludedMachines, excludedTypes, excludedPurposes, excludedModes, onToggleHarness, onToggleMachine, onToggleClass, onClear, basePath, }: HarnessFilterBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=HarnessFilterBar.d.ts.map