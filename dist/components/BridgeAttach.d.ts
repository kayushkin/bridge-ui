export interface BridgeAttachProps {
    sessionId: string;
    attachToken: string;
    /** Toggle for the parent to pause the WS without unmounting. */
    enabled?: boolean;
    /** Called when the user clicks the explicit detach button. */
    onDetach?: () => void;
    /** Optional className on the outer wrapper for layout/theming overrides. */
    className?: string;
}
export declare function BridgeAttach({ sessionId, attachToken, enabled, onDetach, className, }: BridgeAttachProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BridgeAttach.d.ts.map