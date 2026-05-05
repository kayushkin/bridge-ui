import type { Machine, CreateMachineRequest, UpdateMachineRequest } from './types';
export declare function useBridgeMachines(): {
    machines: Machine[];
    machineMap: Map<string, Machine>;
    loading: boolean;
    error: string | null;
    createMachine: (data: CreateMachineRequest) => Promise<Machine | null>;
    updateMachine: (id: string, data: UpdateMachineRequest) => Promise<boolean>;
    deleteMachine: (id: string) => Promise<boolean>;
    refresh: () => Promise<void>;
};
//# sourceMappingURL=useBridgeMachines.d.ts.map