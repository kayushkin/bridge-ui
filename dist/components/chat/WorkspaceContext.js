import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from 'react';
export const WorkspaceContext = createContext(null);
export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx)
        throw new Error('useWorkspace must be called inside WorkspaceProvider');
    return ctx;
}
export function WorkspaceProvider({ value, children }) {
    return _jsx(WorkspaceContext.Provider, { value: value, children: children });
}
//# sourceMappingURL=WorkspaceContext.js.map