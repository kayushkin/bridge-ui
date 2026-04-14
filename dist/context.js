import { createContext, useContext } from 'react';
export const BridgeContext = createContext(null);
export function useBridgeConfig() {
    const ctx = useContext(BridgeContext);
    if (!ctx)
        throw new Error('useBridgeConfig: wrap your component tree in <BridgeProvider>');
    return ctx;
}
//# sourceMappingURL=context.js.map