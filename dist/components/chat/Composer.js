import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
export function Composer({ connected, streaming, paused, uiState, activity, onSend, onStop, onResume }) {
    const [text, setText] = useState('');
    const inputRef = useRef(null);
    const handleSubmit = () => {
        const t = text.trim();
        if (!t || !connected || streaming)
            return;
        onSend(t);
        setText('');
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };
    useEffect(() => { if (connected && !streaming)
        inputRef.current?.focus(); }, [connected, streaming]);
    const showStatus = uiState && uiState !== 'empty';
    const stateLabel = uiState ? uiState.charAt(0).toUpperCase() + uiState.slice(1) : '';
    const activityText = activity.kind !== 'idle' && uiState === 'running'
        ? (activity.kind === 'tool' ? activity.name ?? 'tool' : activity.kind === 'thinking' ? 'thinking' : 'streaming')
        : '';
    return (_jsxs("div", { className: "bc-composer-wrap", children: [showStatus && (_jsxs("div", { className: `bc-composer-status bc-composer-status-${uiState}`, children: [_jsx("span", { className: `bc-status-dot bc-status-dot-${uiState}` }), _jsx("span", { className: "bc-composer-status-label", children: stateLabel }), activityText && _jsxs("span", { className: "bc-composer-status-activity", children: ["\u00B7 ", activityText] })] })), _jsxs("div", { className: "bc-composer", children: [_jsx("textarea", { ref: inputRef, className: "bc-composer-input", value: text, onChange: e => setText(e.target.value), onKeyDown: handleKeyDown, placeholder: connected ? 'Send a message...' : 'Select a session', disabled: !connected || streaming, rows: 1 }), streaming ? (_jsx("button", { className: "bc-composer-btn bc-btn-stop", onClick: onStop, children: "Stop" })) : paused ? (_jsx("button", { className: "bc-composer-btn bc-btn-resume", onClick: onResume, children: "Resume" })) : (_jsx("button", { className: "bc-composer-btn", onClick: handleSubmit, disabled: !text.trim() || !connected, children: "Send" }))] })] }));
}
//# sourceMappingURL=Composer.js.map