import { createContext, useContext } from 'react';
export const DEFAULT_BRIDGE_ROUTES = {
    chat: '/',
    instances: '/instances',
    sessions: '/sessions',
    auth: '/auth',
    usage: '/usage',
    settings: '/settings',
    agents: '/agents',
    files: '/files',
    skills: '/skills',
    tools: '/tools',
    permissions: '/permissions',
    conformance: '/conformance',
    kanban: '/kanban',
    principals: '/principals',
    orchestrator: '/orchestrator',
    card: '/card',
    notes: '',
};
export const BridgeContext = createContext(null);
export function useBridgeConfig() {
    const ctx = useContext(BridgeContext);
    if (!ctx)
        throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>');
    return ctx;
}
//# sourceMappingURL=context.js.map