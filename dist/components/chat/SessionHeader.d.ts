import type { LogRow } from '../../types';
import type { ChatSession, CollapseState } from './types';
export declare function SessionHeader({ chat, uiState, activity, rows, instance, onRename, onPrev, onNext, hasPrev, hasNext, collapseState, onToggleTurns, onToggleThread, onToggleTimeline, onToggleGit, onCloseAllPanes }: {
    chat: ChatSession | null;
    uiState: string;
    activity: {
        kind: string;
        name?: string;
    };
    rows: LogRow[];
    instance: {
        name: string;
        transport: string;
    } | null;
    onRename: (name: string) => void;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
    collapseState: CollapseState;
    onToggleTurns: () => void;
    onToggleThread: () => void;
    onToggleTimeline: () => void;
    onToggleGit: () => void;
    onCloseAllPanes: () => void;
}): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=SessionHeader.d.ts.map