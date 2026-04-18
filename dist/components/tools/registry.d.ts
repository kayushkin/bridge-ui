import type { FC } from 'react';
import type { ToolRendererProps } from './types';
export declare function registerToolRenderer(toolName: string, component: FC<ToolRendererProps>): void;
export declare function getToolRenderer(toolName: string): FC<ToolRendererProps> | undefined;
//# sourceMappingURL=registry.d.ts.map