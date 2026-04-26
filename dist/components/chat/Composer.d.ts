export declare function Composer({ connected, streaming, paused, uiState, activity, onSend, onStop, onResume }: {
    connected: boolean;
    streaming: boolean;
    paused: boolean;
    uiState: string;
    activity: {
        kind: string;
        name?: string;
    };
    onSend: (text: string) => void;
    onStop: () => void;
    onResume: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Composer.d.ts.map