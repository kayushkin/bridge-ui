import type { HarnessInfo } from '../../types';
import type { StoreModel, WorkspaceState } from './types';
interface WorkspaceProps {
    workspace: WorkspaceState;
    focused: boolean;
    onFocus: () => void;
    onUpdate: (fn: (w: WorkspaceState) => WorkspaceState) => void;
    onClose?: () => void;
    harnesses: HarnessInfo[];
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
export declare function Workspace({ workspace, focused, onFocus, onUpdate, onClose, harnesses, storeModels, bridgePrefs }: WorkspaceProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Workspace.d.ts.map