import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
export function EditableName({ value, onSave, className }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef(null);
    useEffect(() => { if (editing)
        inputRef.current?.focus(); }, [editing]);
    useEffect(() => { setDraft(value); }, [value]);
    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value)
            onSave(trimmed);
        setEditing(false);
    };
    if (!editing) {
        return _jsx("span", { className: className, onDoubleClick: () => setEditing(true), title: value, children: value });
    }
    return (_jsx("input", { ref: inputRef, className: "bc-inline-edit", value: draft, onChange: e => setDraft(e.target.value), onBlur: commit, onKeyDown: e => { if (e.key === 'Enter')
            commit(); if (e.key === 'Escape')
            setEditing(false); } }));
}
//# sourceMappingURL=EditableName.js.map