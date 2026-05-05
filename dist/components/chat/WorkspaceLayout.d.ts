import type { WorkspaceLayoutNode } from './types';
interface WorkspaceLayoutProps {
    node: WorkspaceLayoutNode;
    renderLeaf: (workspaceId: string) => React.ReactNode;
    onResize: (path: number[], sizes: number[]) => void;
}
export declare function WorkspaceLayout({ node, renderLeaf, onResize }: WorkspaceLayoutProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=WorkspaceLayout.d.ts.map