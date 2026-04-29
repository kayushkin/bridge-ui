export declare function Composer({ sessionId, connected, streaming, paused, onSend, onStop, onResume }: {
    sessionId: string | null | undefined;
    connected: boolean;
    streaming: boolean;
    paused: boolean;
    onSend: (text: string) => void;
    onStop: () => void;
    onResume: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Composer.d.ts.map