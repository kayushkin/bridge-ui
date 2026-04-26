import type { BridgeInstance, HarnessInfo } from '../../types';
interface NewSessionMenuProps {
    instances: BridgeInstance[];
    harnesses: HarnessInfo[];
    defaultInstanceId?: string;
    basePath: string;
    instancesPath: string;
    onPick: (instanceId: string) => void;
    onClose: () => void;
}
export declare function NewSessionMenu({ instances, harnesses, defaultInstanceId, basePath, instancesPath, onPick, onClose }: NewSessionMenuProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=NewSessionMenu.d.ts.map