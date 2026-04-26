import type { BridgeInstance, HarnessInfo } from '../../types';
interface InstanceFilterBarProps {
    instances: BridgeInstance[];
    harnesses: HarnessInfo[];
    sessions: Array<{
        instance_id?: string;
    }>;
    excluded: Set<string>;
    onToggle: (instanceId: string) => void;
    onClear: () => void;
    basePath: string;
}
export declare function InstanceFilterBar({ instances, harnesses, sessions, excluded, onToggle, onClear, basePath }: InstanceFilterBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=InstanceFilterBar.d.ts.map