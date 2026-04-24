import type { HarnessInfo } from '../../types';
export declare function HarnessTabBar({ instances, harnesses, sessions, selectedInstance, onSelect, onNewInstance, basePath, instancesPath, onToggleCollapse }: {
    instances: Array<{
        id: string;
        name: string;
        harness_type: string;
        host: string;
        transport: string;
        enabled: boolean;
    }>;
    harnesses: HarnessInfo[];
    sessions: Array<{
        instance_id?: string;
        state: string;
    }>;
    selectedInstance: string;
    onSelect: (id: string) => void;
    onNewInstance: () => void;
    basePath: string;
    instancesPath: string;
    onToggleCollapse: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=HarnessTabBar.d.ts.map