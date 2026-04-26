import type { BridgeInstance, HarnessInfo, Machine, ManagedSession } from '../../types';
import type { UseBridgeFoldersReturn } from '../../useBridgeFolders';
export declare function SessionList({ sessions, instances, machines, harnesses, basePath, instancesPath, defaultInstanceId, openSessionIds, focusedSessionId, onSelect, onSpawnWorkspace, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
    sessions: ManagedSession[];
    instances: BridgeInstance[];
    machines: Machine[];
    harnesses: HarnessInfo[];
    basePath: string;
    instancesPath: string;
    defaultInstanceId?: string;
    openSessionIds: Set<string>;
    focusedSessionId: string | null;
    onSelect: (id: string) => void;
    onSpawnWorkspace: (id: string) => void;
    onNewSession: (instanceId: string) => void;
    connected: boolean;
    getDisplayName: (session: ManagedSession) => string;
    onRename: (id: string, name: string) => void;
    folders: UseBridgeFoldersReturn;
    onAfterFolderChange: () => void;
    onToggleCollapse: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionList.d.ts.map