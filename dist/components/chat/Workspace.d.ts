import type { BridgeInstance, HarnessInfo, Machine } from '../../types';
import type { StoreModel, WorkspaceState } from './types';
interface WorkspaceProps {
    workspace: WorkspaceState;
    focused: boolean;
    onFocus: () => void;
    onUpdate: (fn: (w: WorkspaceState) => WorkspaceState) => void;
    onClose?: () => void;
    onMarkDone?: (sessionId: string, done: boolean) => void;
    onStartPending?: (instanceId: string, sessionId: string) => void;
    harnesses: HarnessInfo[];
    instances: BridgeInstance[];
    machines: Machine[];
    storeModels: StoreModel[];
    bridgePrefs: {
        getDefaults: (harness: string) => {
            model?: string;
            effort?: string;
            max_budget?: number;
            disabled_tools?: string[];
        };
        setHarnessDefaults: (harness: string, config: {
            model?: string;
            effort?: string;
            max_budget?: number;
            disabled_tools?: string[];
        }) => void;
        setLastSession: (instanceId: string, sessionId: string) => void;
    };
}
export declare function Workspace({ workspace, focused, onFocus, onUpdate, onClose, onMarkDone, onStartPending, harnesses, instances, machines, storeModels, bridgePrefs }: WorkspaceProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Workspace.d.ts.map