import type { FetchFn } from '../../types';
export interface ProducerRowProps {
    apiFetch: FetchFn;
    /** Where this host proxies the producer service, from `producerBasePath` on
     *  BridgeProvider. A host that proxies none should not render the row at all
     *  rather than pass an empty string — there is no path to guess. */
    producerBasePath: string;
    /** Where this host mounts the producer's review page, from `routes.orchestrator`.
     *  Empty means it mounts none, and the row stops offering to open it. */
    orchestratorPath: string;
}
export declare function ProducerRow({ apiFetch, producerBasePath, orchestratorPath }: ProducerRowProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ProducerRow.d.ts.map