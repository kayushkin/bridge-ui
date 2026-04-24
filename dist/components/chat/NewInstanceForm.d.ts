import type { HarnessInfo } from '../../types';
export declare function NewInstanceForm({ harnesses, onCreate, onCancel }: {
    harnesses: HarnessInfo[];
    onCreate: (data: {
        name: string;
        harness_type: string;
        host: string;
        transport: 'local' | 'ssh';
        working_dir: string;
        max_concurrent_sessions: number;
    }) => void;
    onCancel: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=NewInstanceForm.d.ts.map