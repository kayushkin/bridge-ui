import type { HarnessInfo, LogRow, Machine, ManagedSession } from '../../types';
import type { ChatSession, PanesHidden } from './types';
import type { GitRepo } from './WorkspaceContext';
export declare function SessionHeader({ chat, session, harnessInfo, machine, machineReachable, basePath, uiState, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseWorkspace, gitRepos, selectedRepo, onSelectRepo }: {
    chat: ChatSession | null;
    /** Full session row from the bridge — drives the details dropdown
     * (source, folder, instance, mode, IDs, timestamps). Undefined when
     * no session is active. */
    session?: ManagedSession | null;
    /** Server-registered HarnessInfo for chat.harness — canonical source for
     * label/emoji/image. Constants are fallbacks for harnesses the server
     * hasn't registered. */
    harnessInfo?: HarnessInfo;
    /** The machine the active session's instance is bound to. Drives the
     * machine chip in the header. Undefined when no session is active. */
    machine?: Machine;
    /** Latest reachability for the active instance's machine (polled
     * upstream). null = unknown / no active session. */
    machineReachable?: boolean | null;
    /** Used to resolve harnessInfo.image (a server-relative path). */
    basePath: string;
    uiState: string;
    rows: LogRow[];
    onRename: (name: string) => void;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
    panesHidden: PanesHidden;
    onToggleTurns: () => void;
    onToggleThread: () => void;
    onToggleTimeline: () => void;
    onToggleGit: () => void;
    onCloseWorkspace?: () => void;
    gitRepos: GitRepo[];
    selectedRepo: string;
    onSelectRepo: (path: string) => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionHeader.d.ts.map