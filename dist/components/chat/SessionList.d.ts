import type { BridgeInstance, HarnessInfo, Machine, ManagedSession, SessionUIState } from '../../types';
import type { UseBridgeFoldersReturn } from '../../useBridgeFolders';
import type { SplitMode } from './types';
export declare function SessionList({ sessions, instances, machines, harnesses, basePath, instancesPath, defaultInstanceId, openSessionIds, focusedSessionId, onSelect, onOpenInSplit, onNewSession, connected, getDisplayName, getSessionUIState, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
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
    onOpenInSplit: (id: string, mode: SplitMode) => void;
    onNewSession: (instanceId: string, mode: SplitMode) => void;
    connected: boolean;
    getDisplayName: (session: ManagedSession) => string;
    getSessionUIState: (session: ManagedSession) => SessionUIState;
    onRename: (id: string, name: string) => void;
    folders: UseBridgeFoldersReturn;
    onAfterFolderChange: () => void;
    onToggleCollapse: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionList.d.ts.map