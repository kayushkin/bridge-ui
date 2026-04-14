import type { InstanceStatus, InstanceCredential } from './types';
import type { Instance } from '@kayushkin/llm-bridge-types';
export declare function useBridgeInstances(): {
    instances: Instance[];
    loading: boolean;
    error: string | null;
    instancesByHarness: (harness: string) => Instance[];
    instanceMap: Map<string, Instance>;
    createInstance: (data: Partial<Instance>) => Promise<Instance | null>;
    updateInstance: (id: string, data: Partial<Instance>) => Promise<boolean>;
    deleteInstance: (id: string) => Promise<boolean>;
    getStatus: (id: string) => Promise<InstanceStatus | null>;
    getCredentials: (id: string) => Promise<InstanceCredential[]>;
    bindCredential: (instanceId: string, credentialId: string, priority: number, maxConcurrent: number) => Promise<boolean>;
    unbindCredential: (instanceId: string, credentialId: string) => Promise<boolean>;
    refresh: () => Promise<void>;
};
//# sourceMappingURL=useBridgeInstances.d.ts.map