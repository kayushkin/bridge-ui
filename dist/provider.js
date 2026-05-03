import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { BridgeContext, DEFAULT_BRIDGE_ROUTES } from './context';
export function BridgeProvider({ fetch: fetchFn, basePath = '/api/bridge', skillStoreBasePath = '', toolStoreBasePath = '', permissionStoreBasePath = '', routes, children, }) {
    const config = useMemo(() => ({
        fetch: fetchFn,
        basePath,
        skillStoreBasePath,
        toolStoreBasePath,
        permissionStoreBasePath,
        routes: { ...DEFAULT_BRIDGE_ROUTES, ...routes },
    }), [fetchFn, basePath, skillStoreBasePath, toolStoreBasePath, permissionStoreBasePath, routes]);
    return _jsx(BridgeContext, { value: config, children: children });
}
//# sourceMappingURL=provider.js.map