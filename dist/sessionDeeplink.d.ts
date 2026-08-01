export type SessionDeeplinkState = {
    applied: string | null;
    awaiting: string | null;
};
export declare const initialSessionDeeplinkState: SessionDeeplinkState;
export declare function readSessionDeeplink(param: string | null, state: SessionDeeplinkState): {
    open: string | null;
    state: SessionDeeplinkState;
};
export declare function writeSessionParam(focusedSessionId: string | null, state: SessionDeeplinkState): {
    write: boolean;
    value: string | null;
    state: SessionDeeplinkState;
};
//# sourceMappingURL=sessionDeeplink.d.ts.map