import type { LogRow } from '../../types';
import type { ChatSession, PanesHidden } from './types';
export declare function SessionHeader({ chat, uiState, activity, rows, onRename, onPrev, onNext, hasPrev, hasNext, panesHidden, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseWorkspace }: {
    chat: ChatSession | null;
    uiState: string;
    activity: {
        kind: string;
        name?: string;
    };
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
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionHeader.d.ts.map