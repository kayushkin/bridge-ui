import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridgeConfig } from '../../context';
import { PermissionModeAsk, PermissionModeAskAll, PermissionModeAuto, PermissionModeBlockAll, PermissionModeBypass, PermissionModeCustom, PermissionModePlan, PermissionModeRead, } from '../../types';
// SessionPermissionMode is the per-session permission-mode selector rendered
// alongside Compact / Tools / Fork in the chat controls bar. The session
// inherits the global mode at creation; this control overrides it for
// THIS session only — see snapshotPermissionModeIntoSession on the server
// for the create-time logic.
//
// Persists via PUT /sessions/{id}/permission-mode; the new value lands in
// session.harness_config.permission_mode. Read live by the PreToolUse
// prehook (takes effect on the next tool call) and forwarded to the
// harness as a start param on next spawn/resume.
//
// Options are filtered by the harness's SupportedPermissionModes.
const MODE_LABELS = {
    [PermissionModeBlockAll]: 'Block All',
    [PermissionModePlan]: 'Plan',
    [PermissionModeRead]: 'Read',
    [PermissionModeAskAll]: 'Ask All',
    [PermissionModeAsk]: 'Rules',
    [PermissionModeAuto]: 'Auto Rules',
    [PermissionModeBypass]: 'Allow All',
    [PermissionModeCustom]: 'Custom…',
};
const MODE_TITLES = {
    [PermissionModeBlockAll]: 'Deny every tool call. Agent sees the deny and can keep reasoning or ask you.',
    [PermissionModePlan]: 'Only planning tools (Read / Glob / Grep / TodoWrite). No writes, no shell.',
    [PermissionModeRead]: 'Read-only inspection (Read / Glob / Grep / LS / NotebookRead). No writes, no shell.',
    [PermissionModeAskAll]: 'Skip rules and prompt on every single tool call.',
    [PermissionModeAsk]: 'Default. Use permission rules; prompt only when a rule says ask or no rule matches.',
    [PermissionModeAuto]: 'Auto-allow safe tools (reads + edits + planning); rules for shell / fetch / agent spawns.',
    [PermissionModeBypass]: 'Allow every tool call. AskUserQuestion still pauses for your answer.',
    [PermissionModeCustom]: 'Raw harness-specific approval / sandbox knobs (advanced).',
};
// MODE_ORDER controls dropdown ordering (restrictive → permissive, then
// special at the bottom). Modes not present in the harness's supported
// list are filtered out; modes the harness adds but we haven't listed
// here append at the end so unknown additions still render.
const MODE_ORDER = [
    PermissionModeBlockAll,
    PermissionModePlan,
    PermissionModeRead,
    PermissionModeAskAll,
    PermissionModeAsk,
    PermissionModeAuto,
    PermissionModeBypass,
    PermissionModeCustom,
];
// MODE_DIVIDER_BEFORE inserts a visual separator before Custom so the
// power-user escape hatch is visually distinct from the everyday modes.
const MODE_DIVIDER_BEFORE = new Set([PermissionModeCustom]);
export function SessionPermissionMode({ session, harnesses, }) {
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    const cfg = session.harness_config;
    const initial = useMemo(() => readMode(cfg), [cfg]);
    const [mode, setMode] = useState(initial);
    const [busy, setBusy] = useState(false);
    useEffect(() => { setMode(initial); }, [initial]);
    const supported = useMemo(() => {
        const info = harnesses?.find(h => h.name === session.harness);
        const advertised = info?.supported_permission_modes;
        const raw = advertised && advertised.length > 0
            ? advertised
            : [PermissionModeAsk, PermissionModeBypass];
        // Sort by canonical MODE_ORDER, append any unknown modes at the end
        // so server-side additions still render without a UI bump.
        const known = MODE_ORDER.filter(m => raw.includes(m));
        const extras = raw.filter(m => !MODE_ORDER.includes(m));
        return [...known, ...extras];
    }, [harnesses, session.harness]);
    const handleChange = useCallback(async (next) => {
        if (busy || next === mode)
            return;
        setBusy(true);
        const prev = mode;
        setMode(next);
        try {
            const res = await apiFetch(`${basePath}/sessions/${session.session_id}/permission-mode`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: next }),
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
        }
        catch {
            setMode(prev);
        }
        finally {
            setBusy(false);
        }
    }, [apiFetch, basePath, session.session_id, mode, busy]);
    return (_jsx("div", { className: "bc-ctrl-mode", title: MODE_TITLES[mode] ?? '', children: _jsx("select", { className: "bc-ctrl-mode-select", value: mode, disabled: busy, onChange: e => handleChange(e.target.value), "aria-label": "Permission mode", children: supported.map((m, i) => {
                // Render an HR-style disabled separator row before "special"
                // modes (Custom for now). HTML <select> doesn't support real
                // separators, so use a disabled option with em-dashes — every
                // browser respects the disabled state.
                const showDivider = MODE_DIVIDER_BEFORE.has(m) && i > 0;
                const opt = (_jsx("option", { value: m, title: MODE_TITLES[m] ?? '', children: MODE_LABELS[m] ?? m }, m));
                return showDivider
                    ? [
                        _jsx("option", { disabled: true, value: "", children: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" }, `__sep_${m}`),
                        opt,
                    ]
                    : opt;
            }) }) }));
}
function readMode(cfg) {
    if (!cfg)
        return PermissionModeAsk;
    const explicit = cfg.permission_mode;
    if (typeof explicit === 'string' && explicit !== '')
        return explicit;
    if (cfg.bypass_permissions === true)
        return PermissionModeBypass;
    return PermissionModeAsk;
}
//# sourceMappingURL=SessionPermissionMode.js.map