import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { BridgeContext, DEFAULT_BRIDGE_ROUTES } from './context';
import { MinimalChromeProvider } from './components/minimal/MinimalChromeContext';
export function BridgeProvider({ fetch: fetchFn, basePath = '/api/bridge', skillStoreBasePath = '', toolStoreBasePath = '', permissionStoreBasePath = '', kanbanStoreBasePath = '', noteboardBasePath = '', bridgeAdapterBasePath = '', producerBasePath = '', usageStoreBasePath = '', renderHarnessExtension, routes, children, }) {
    const config = useMemo(() => ({
        fetch: fetchFn,
        basePath,
        skillStoreBasePath,
        toolStoreBasePath,
        permissionStoreBasePath,
        kanbanStoreBasePath,
        noteboardBasePath,
        bridgeAdapterBasePath,
        producerBasePath,
        usageStoreBasePath,
        renderHarnessExtension: renderHarnessExtension ?? null,
        routes: { ...DEFAULT_BRIDGE_ROUTES, ...routes },
    }), [fetchFn, basePath, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, kanbanStoreBasePath, noteboardBasePath, bridgeAdapterBasePath, producerBasePath, usageStoreBasePath, renderHarnessExtension, routes]);
    return (_jsx(BridgeContext, { value: config, children: _jsx(MinimalChromeProvider, { children: children }) }));
}
//# sourceMappingURL=provider.js.map