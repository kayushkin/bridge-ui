import type { JSX } from 'react';
export interface BridgeOrchestratorProps {
    /**
     * Render a referenced session that is waiting on an OPEN QUESTION as an
     * already-expanded inline card, rather than as a collapsed chip somebody has
     * to click. Default true: this page exists to show what the fleet is blocked
     * on, and a blocked session is the thing it is most worth being blocked on.
     *
     * A host that would rather have a quiet page of uniform chips — or that has
     * no signals route to read — passes false, and every reference stays a chip.
     */
    expandSessionsWithOpenQuestions?: boolean;
}
export declare function BridgeOrchestrator({ expandSessionsWithOpenQuestions, }?: BridgeOrchestratorProps): JSX.Element;
//# sourceMappingURL=BridgeOrchestrator.d.ts.map