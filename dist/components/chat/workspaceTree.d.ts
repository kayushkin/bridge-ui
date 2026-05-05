import type { WorkspaceLayoutNode } from './types';
export declare function findLeafPath(node: WorkspaceLayoutNode | null, id: string): number[] | null;
export declare function iterateLeafIds(node: WorkspaceLayoutNode | null): Generator<string>;
export declare function firstLeafId(node: WorkspaceLayoutNode | null): string | null;
export declare function splitLeaf(tree: WorkspaceLayoutNode | null, targetId: string, newWorkspaceId: string, direction: 'h' | 'v', position?: 'before' | 'after'): WorkspaceLayoutNode;
export declare function removeLeaf(tree: WorkspaceLayoutNode | null, targetId: string): WorkspaceLayoutNode | null;
export declare function setSplitSizes(tree: WorkspaceLayoutNode, path: number[], sizes: number[]): WorkspaceLayoutNode;
export declare function isLayoutValid(node: WorkspaceLayoutNode | null, knownIds: Set<string>): boolean;
export declare function buildFlatLayout(workspaceIds: string[]): WorkspaceLayoutNode | null;
//# sourceMappingURL=workspaceTree.d.ts.map