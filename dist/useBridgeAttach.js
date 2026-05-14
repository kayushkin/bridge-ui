import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridgeConfig } from './context';
// wsUrlFor turns a relative basePath like "/api/bridge" into a fully
// qualified ws(s):// URL on the current page origin. Absolute basePaths
// (http://x or https://x) are honoured verbatim — useful for dev setups
// pointing at bridge-server on a different host.
function wsUrlFor(basePath, sessionId, token) {
    const path = `/sessions/${encodeURIComponent(sessionId)}/attach?token=${encodeURIComponent(token)}`;
    // Absolute URL (http(s)://...) — swap scheme.
    if (/^https?:\/\//i.test(basePath)) {
        return basePath.replace(/^http/i, 'ws') + path;
    }
    // Page-relative — derive from window.location.
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : '';
    return `${proto}//${host}${basePath}${path}`;
}
export function useBridgeAttach(opts) {
    const { sessionId, attachToken, enabled = true } = opts;
    const { basePath } = useBridgeConfig();
    const [status, setStatus] = useState('idle');
    const [role, setRole] = useState(null);
    const [error, setError] = useState(null);
    const [exit, setExit] = useState(null);
    // Mutable refs: WS instance + binary subscribers list. These live across
    // renders without forcing re-renders when callbacks register/unregister.
    const wsRef = useRef(null);
    const subsRef = useRef(new Set());
    // sendCtrl is keyed off wsRef so it survives re-renders without
    // tearing the socket down — the actual function identity is stable.
    const sendCtrl = useCallback((ctrl) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN)
            return;
        ws.send(JSON.stringify(ctrl));
    }, []);
    const send = useCallback((data) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN)
            return;
        // Reader-role clients can still call send(); the server silently
        // drops their input frames. We don't gate here so the caller's
        // keystroke pump stays simple — role is exposed for UI affordances.
        ws.send(data);
    }, []);
    const resize = useCallback((rows, cols) => {
        if (rows <= 0 || cols <= 0)
            return;
        sendCtrl({ type: 'resize', rows, cols });
    }, [sendCtrl]);
    const close = useCallback(() => {
        const ws = wsRef.current;
        if (!ws)
            return;
        // Best-effort goodbye — server treats {type:"close"} as a clean
        // detach. Then close the WS itself; readyState guards prevent
        // sending on an already-closed socket.
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'close' }));
            }
            catch { /* peer gone */ }
        }
        try {
            ws.close();
        }
        catch { /* already closing */ }
    }, []);
    const onData = useCallback((cb) => {
        subsRef.current.add(cb);
        return () => { subsRef.current.delete(cb); };
    }, []);
    // Lifecycle: open WS when enabled + sessionId + token are present;
    // tear down cleanly on unmount or input change. Status transitions
    // are the only React state updates from inside the socket handlers.
    useEffect(() => {
        if (!enabled || !sessionId || !attachToken) {
            setStatus('idle');
            return;
        }
        setStatus('connecting');
        setRole(null);
        setError(null);
        setExit(null);
        const url = wsUrlFor(basePath, sessionId, attachToken);
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        ws.onopen = () => {
            setStatus('open');
        };
        ws.onmessage = (ev) => {
            const data = ev.data;
            if (data instanceof ArrayBuffer) {
                // Fan binary out to every subscriber. Subscribers are responsible
                // for not throwing — but if one does, isolate from the rest so a
                // single bad listener can't break the terminal feed.
                for (const cb of subsRef.current) {
                    try {
                        cb(data);
                    }
                    catch { /* listener bug; keep going */ }
                }
                return;
            }
            // Text frame: JSON control envelope.
            let ctrl;
            try {
                ctrl = JSON.parse(data);
            }
            catch {
                return;
            }
            if (ctrl.type === 'role' && (ctrl.role === 'writer' || ctrl.role === 'reader')) {
                setRole(ctrl.role);
            }
            else if (ctrl.type === 'exit') {
                setExit({ code: ctrl.code ?? 0, signal: ctrl.signal ?? '' });
            }
            // Other control types (signal et al.) — ignore quietly to mirror
            // the server's "drop unknown rather than tear down" posture.
        };
        ws.onerror = () => {
            // The browser's WebSocket API doesn't expose useful error detail;
            // surface a generic message and let the close handler set final
            // status. We avoid setStatus('error') here so the natural
            // close→'closed' transition still runs.
            setError('attach websocket error');
        };
        ws.onclose = (ev) => {
            // Clean close (1000) and "no status" (1005, common for client-
            // initiated close) both count as 'closed'. Anything else is an
            // unexpected drop — surface as 'error' so the UI can reattach.
            if (ev.code === 1000 || ev.code === 1005) {
                setStatus('closed');
            }
            else {
                setStatus('error');
                if (!error)
                    setError(`attach closed (${ev.code} ${ev.reason || 'no reason'})`);
            }
            if (wsRef.current === ws)
                wsRef.current = null;
        };
        return () => {
            // React strict-mode and effect-rerun cleanup: signal a clean
            // close and let the browser run the close handshake.
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({ type: 'close' }));
                }
                catch { /* peer gone */ }
            }
            try {
                ws.close(1000, 'unmount');
            }
            catch { /* already closing */ }
            if (wsRef.current === ws)
                wsRef.current = null;
        };
        // basePath is read once per (re)connect; if it changes we want a new socket.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, sessionId, attachToken, basePath]);
    return { status, role, error, exit, send, resize, close, onData };
}
//# sourceMappingURL=useBridgeAttach.js.map