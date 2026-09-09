import { useCallback, useEffect, useState } from 'react';
import { useBridgeConfig } from '../../context';
export function useAttachToken(sessionId, mode) {
    const { fetch: bridgeFetch, basePath } = useBridgeConfig();
    const [state, setState] = useState({ status: 'idle' });
    const [refreshTick, setRefreshTick] = useState(0);
    const refresh = useCallback(() => setRefreshTick(tick => tick + 1), []);
    const isPty = mode === 'pty';
    useEffect(() => {
        if (!sessionId || !isPty) {
            setState({ status: 'idle' });
            return;
        }
        let cancelled = false;
        setState({ status: 'loading' });
        bridgeFetch(`${basePath}/sessions/${sessionId}/attach-token`)
            .then(async (response) => {
            if (response.status === 404)
                return null;
            if (!response.ok)
                throw new Error(`${response.status} ${await response.text()}`);
            return (await response.json());
        })
            .then(body => {
            if (cancelled)
                return;
            if (body === null) {
                setState({ status: 'absent' });
                return;
            }
            const token = body.attach_token ?? '';
            // An empty token is not a token. Reported as absent rather than handed to
            // `BridgeAttach`, which would open a WebSocket the server must then refuse.
            setState(token ? { status: 'ready', token } : { status: 'absent' });
        })
            .catch((err) => {
            if (cancelled)
                return;
            setState({
                status: 'error',
                message: err instanceof Error ? err.message : String(err),
            });
        });
        return () => {
            cancelled = true;
        };
    }, [sessionId, isPty, refreshTick, bridgeFetch, basePath]);
    return { state, refresh };
}
//# sourceMappingURL=useAttachToken.js.map