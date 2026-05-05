import type { SessionUIState } from '../../types';
export type StatusDotState = SessionUIState | 'placeholder' | 'compacting' | (string & {});
export declare function StatusDot({ state, title, className }: {
    state: StatusDotState;
    title?: string;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=StatusDot.d.ts.map