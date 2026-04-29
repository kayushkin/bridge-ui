import type { BridgeInstance, HarnessInfo } from '../../types';
import type { SplitMode } from './types';
interface NewSessionMenuProps {
    instances: BridgeInstance[];
    harnesses: HarnessInfo[];
    defaultInstanceId?: string;
    basePath: string;
    instancesPath: string;
    onPick: (instanceId: string, mode: SplitMode) => void;
    onClose: () => void;
}
export declare function NewSessionMenu({ instances, harnesses, defaultInstanceId, basePath, instancesPath, onPick, onClose }: NewSessionMenuProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=NewSessionMenu.d.ts.map