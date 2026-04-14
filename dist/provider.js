import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { BridgeContext } from './context';
export function BridgeProvider({ fetch: fetchFn, basePath = '/api/bridge', children }) {
    const config = useMemo(() => ({
        fetch: fetchFn,
        basePath,
    }), [fetchFn, basePath]);
    return _jsx(BridgeContext, { value: config, children: children });
}
//# sourceMappingURL=provider.js.map