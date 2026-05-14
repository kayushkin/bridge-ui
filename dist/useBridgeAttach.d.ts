export type AttachStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
export type AttachRole = 'writer' | 'reader';
export interface AttachExit {
    code: number;
    signal: string;
}
export interface UseBridgeAttachReturn {
    status: AttachStatus;
    role: AttachRole | null;
    /** Last error message; clears when a new connect succeeds. */
    error: string | null;
    /** Server-reported exit; set once when the pty terminates. */
    exit: AttachExit | null;
    /** Send binary frame (raw pty stdin). No-op if socket isn't open. */
    send: (data: ArrayBuffer | Uint8Array) => void;
    /** Send {type:"resize",...} control frame. No-op if socket isn't open. */
    resize: (rows: number, cols: number) => void;
    /** Send {type:"close"} then close the WS. Safe to call repeatedly. */
    close: () => void;
    /** Subscribe to inbound binary frames. Returns unsubscribe. */
    onData: (cb: (data: ArrayBuffer) => void) => () => void;
}
export interface UseBridgeAttachOptions {
    sessionId: string;
    attachToken: string;
    /** When false the hook stays idle (useful for gating on session.mode). */
    enabled?: boolean;
}
export declare function useBridgeAttach(opts: UseBridgeAttachOptions): UseBridgeAttachReturn;
//# sourceMappingURL=useBridgeAttach.d.ts.map