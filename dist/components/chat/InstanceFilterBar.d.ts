import type { BridgeInstance, HarnessInfo, Machine } from '../../types';
interface InstanceFilterBarProps {
    instances: BridgeInstance[];
    machines: Machine[];
    harnesses: HarnessInfo[];
    sessions: Array<{
        instance_id?: string;
    }>;
    excluded: Set<string>;
    excludedMachines: Set<string>;
    onToggle: (instanceId: string) => void;
    onToggleMachine: (machineId: string) => void;
    onClear: () => void;
    basePath: string;
}
export declare function InstanceFilterBar({ instances, machines, harnesses, sessions, excluded, excludedMachines, onToggle, onToggleMachine, onClear, basePath, }: InstanceFilterBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=InstanceFilterBar.d.ts.map