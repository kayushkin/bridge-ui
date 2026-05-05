import type { HarnessInfo, Machine } from '../../types';
interface HarnessFilterBarProps {
    machines: Machine[];
    harnesses: HarnessInfo[];
    sessions: Array<{
        harness: string;
        instance_id?: string;
    }>;
    instanceMachineByID: Map<string, string>;
    excludedHarnesses: Set<string>;
    excludedMachines: Set<string>;
    onToggleHarness: (harness: string) => void;
    onToggleMachine: (machineId: string) => void;
    onClear: () => void;
    basePath: string;
}
export declare function HarnessFilterBar({ machines, harnesses, sessions, instanceMachineByID, excludedHarnesses, excludedMachines, onToggleHarness, onToggleMachine, onClear, basePath, }: HarnessFilterBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=HarnessFilterBar.d.ts.map