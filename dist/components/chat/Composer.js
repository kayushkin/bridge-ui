import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
export function Composer({ connected, streaming, paused, onSend, onStop, onResume }) {
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
    return (_jsxs("div", { className: "bc-composer", children: [_jsx("textarea", { ref: inputRef, className: "bc-composer-input", value: text, onChange: e => setText(e.target.value), onKeyDown: handleKeyDown, placeholder: connected ? 'Send a message...' : 'Select a session', disabled: !connected || streaming, rows: 1 }), streaming ? (_jsx("button", { className: "bc-composer-btn bc-btn-stop", onClick: onStop, children: "Stop" })) : paused ? (_jsx("button", { className: "bc-composer-btn bc-btn-resume", onClick: onResume, children: "Resume" })) : (_jsx("button", { className: "bc-composer-btn", onClick: handleSubmit, disabled: !text.trim() || !connected, children: "Send" }))] }));
}
//# sourceMappingURL=Composer.js.map