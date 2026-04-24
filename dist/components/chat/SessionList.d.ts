import type { UseBridgeFoldersReturn } from '../../useBridgeFolders';
import type { SidebarSession } from './types';
export declare function SessionList({ sessions, activeSession, onSelect, onNewSession, connected, getDisplayName, onRename, folders, onAfterFolderChange, onToggleCollapse }: {
    sessions: SidebarSession[];
    activeSession: string;
    onSelect: (id: string) => void;
    onNewSession: () => void;
    connected: boolean;
    getDisplayName: (session: SidebarSession) => string;
    onRename: (id: string, name: string) => void;
    folders: UseBridgeFoldersReturn;
    onAfterFolderChange: () => void;
    onToggleCollapse: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionList.d.ts.map