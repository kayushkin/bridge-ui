import type { BridgeInstance, FetchFn, ManagedSession } from '../../types';
export declare function ProducerRow({ apiFetch, producerBasePath, instances, sessions, onSelect, onNewChat }: {
    apiFetch: FetchFn;
    producerBasePath: string;
    instances: BridgeInstance[];
    sessions: ManagedSession[];
    onSelect: (id: string) => void;
    onNewChat: (instanceId: string, mode: 'replace') => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ProducerRow.d.ts.map