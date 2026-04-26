import { createContext, useContext } from 'react';
export const DEFAULT_BRIDGE_ROUTES = {
    chat: '/bridge',
    instances: '/bridge/instances',
    sessions: '/bridge/sessions',
    auth: '/bridge/auth',
    usage: '/bridge/usage',
    settings: '/bridge/settings',
    skills: '/bridge/skills',
    conformance: '/bridge/conformance',
};
export const BridgeContext = createContext(null);
export function useBridgeConfig() {
    const ctx = useContext(BridgeContext);
    if (!ctx)
        throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>');
    return ctx;
}
//# sourceMappingURL=context.js.map