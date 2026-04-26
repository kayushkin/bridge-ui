import type { BridgeInstance, HarnessInfo } from '../../types';
import type { UseBridgeFoldersReturn } from '../../useBridgeFolders';
import type { SidebarSession } from './types';
export declare function SessionList({ sessions, instances, harnesses, basePath, instancesPath, defaultInstanceId, openSessionIds, focusedSessionId, onSelect, onSpawnWorkspace, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
    sessions: SidebarSession[];
    instances: BridgeInstance[];
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
    getDisplayName: (session: SidebarSession) => string;
    onRename: (id: string, name: string) => void;
    folders: UseBridgeFoldersReturn;
    onAfterFolderChange: () => void;
    onToggleCollapse: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionList.d.ts.map