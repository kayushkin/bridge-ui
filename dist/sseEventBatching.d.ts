import type { BridgeEvent } from './types';
export interface FrameScheduler {
    request(callback: () => void): number;
    cancel(handle: number): void;
}
export declare const animationFrameScheduler: FrameScheduler;
export declare function isDeferrableEventType(type: string): boolean;
export interface SSEEventBatcher {
    push(event: BridgeEvent): void;
    pushAndFlush(event: BridgeEvent): void;
    flush(): void;
    cancel(): void;
    pending(): number;
}
export declare function createSSEEventBatcher(deliver: (events: BridgeEvent[]) => void, scheduler?: FrameScheduler): SSEEventBatcher;
//# sourceMappingURL=sseEventBatching.d.ts.map