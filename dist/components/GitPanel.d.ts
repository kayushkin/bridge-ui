import type { SessionUIState } from '../types';
interface GitPanelProps {
    sessionId: string;
    uiState: SessionUIState;
    onToggleCollapse: () => void;
    style?: React.CSSProperties;
    paneKey?: string;
}
export declare function GitPanel({ sessionId, uiState, onToggleCollapse, style, paneKey }: GitPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=GitPanel.d.ts.map