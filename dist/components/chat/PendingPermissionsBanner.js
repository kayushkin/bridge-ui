import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { useBridgeConfig } from '../../context';
import { HookSourceUserInput } from '../../types';
import { useWorkspace } from './WorkspaceContext';
// PendingPermissionsBanner is the sticky surface for awaiting_resolution
// HookEvents parked by bridge-server's PreToolUse hook. Renders nothing
// when there are no pending hooks.
//
// Card flavor is picked by HookEvent.source:
//   - "user_input" (HookSourceUserInput): the model is asking the human a
//     structured question (e.g. CC's AskUserQuestion). Renders
//     AskUserQuestionCard — option groups whose selections post back via
//     updatedInput, so the model receives the answer directly.
//   - "permission_prompt" (default for tool-gating asks): renders
//     PendingHookCard — generic allow/deny + always-rule surface.
export function PendingPermissionsBanner() {
    const ws = useWorkspace();
    const { fetch: apiFetch, basePath } = useBridgeConfig();
    if (ws.pendingHooks.length === 0)
        return null;
    // permission-store sibling path: /api/bridge → /api/permission-store
    const permStoreBase = basePath.replace(/\/[^/]+$/, '/permission-store');
    return (_jsx("div", { className: "bc-pending-banner", role: "region", "aria-label": "Pending permission prompts", children: ws.pendingHooks.map(hook => {
            const key = hook.request_id || `nokey-${hook.event}`;
            if (hook.source === HookSourceUserInput && isAskUserQuestionInput(hook.input)) {
                return (_jsx(AskUserQuestionCard, { hook: hook, onResolve: ws.resolveHook }, key));
            }
            return (_jsx(PendingHookCard, { hook: hook, onResolve: ws.resolveHook, apiFetch: apiFetch, permStoreBase: permStoreBase }, key));
        }) }));
}
function isAskUserQuestionInput(input) {
    if (!input || typeof input !== 'object')
        return false;
    const qs = input.questions;
    return Array.isArray(qs) && qs.length > 0 && qs.every(q => q && typeof q === 'object'
        && typeof q.question === 'string'
        && Array.isArray(q.options));
}
function AskUserQuestionCard({ hook, onResolve, }) {
    const input = hook.input;
    const questions = input.questions;
    const requestId = hook.request_id || '';
    // Per-question selection state: index map -> set of selected option indices.
    // Set is sized 1 for single-select questions, N for multiSelect.
    const [selections, setSelections] = useState(new Map());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const allAnswered = questions.every((_, i) => {
        const s = selections.get(i);
        return s && s.size > 0;
    });
    const toggle = useCallback((qi, oi, multi) => {
        setSelections(prev => {
            const next = new Map(prev);
            const current = next.get(qi) ?? new Set();
            if (multi) {
                const updated = new Set(current);
                if (updated.has(oi))
                    updated.delete(oi);
                else
                    updated.add(oi);
                next.set(qi, updated);
            }
            else {
                next.set(qi, new Set([oi]));
            }
            return next;
        });
    }, []);
    const submit = useCallback(async () => {
        if (!requestId || !allAnswered || busy)
            return;
        setBusy(true);
        setError(null);
        try {
            // Build {questionText: answerLabel}. CC's AskUserQuestion accepts a
            // comma-separated string for multiSelect answers (per its input schema:
            // E.preprocess that joins string arrays into a comma list).
            const answers = {};
            questions.forEach((q, qi) => {
                const chosen = Array.from(selections.get(qi) ?? new Set())
                    .map(oi => q.options[oi]?.label)
                    .filter((label) => Boolean(label));
                answers[q.question] = chosen.join(', ');
            });
            await onResolve({
                requestId,
                behavior: 'allow',
                // Send the full original questions array alongside answers so CC's
                // tool.call() can pair them up; the hook's updatedInput replaces the
                // tool input wholesale.
                updatedInput: { questions, answers },
                resolvedBy: 'user',
            });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [requestId, allAnswered, busy, questions, selections, onResolve]);
    const decline = useCallback(async () => {
        if (!requestId || busy)
            return;
        setBusy(true);
        setError(null);
        try {
            // Deny surfaces CC's "User declined to answer questions" branch.
            await onResolve({ requestId, behavior: 'deny', resolvedBy: 'user' });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [requestId, busy, onResolve]);
    return (_jsxs("div", { className: "bc-pending-card bc-ask-card", children: [_jsxs("div", { className: "bc-pending-card-header", children: [_jsx("strong", { className: "bc-pending-tool", children: "AskUserQuestion" }), _jsx("span", { className: "bc-pending-event", children: "awaiting your answer" })] }), _jsx("div", { className: "bc-ask-questions", children: questions.map((q, qi) => {
                    const selected = selections.get(qi) ?? new Set();
                    const multi = Boolean(q.multiSelect);
                    return (_jsxs("fieldset", { className: "bc-ask-question", children: [q.header && _jsx("legend", { className: "bc-ask-header", children: q.header }), _jsx("p", { className: "bc-ask-question-text", children: q.question }), _jsx("div", { className: "bc-ask-options", children: q.options.map((opt, oi) => {
                                    const isSelected = selected.has(oi);
                                    return (_jsxs("label", { className: `bc-ask-option${isSelected ? ' bc-ask-option-selected' : ''}`, children: [_jsx("input", { type: multi ? 'checkbox' : 'radio', name: `bc-ask-${requestId}-${qi}`, checked: isSelected, disabled: busy, onChange: () => toggle(qi, oi, multi) }), _jsxs("span", { className: "bc-ask-option-body", children: [_jsx("span", { className: "bc-ask-option-label", children: opt.label }), opt.description && (_jsx("span", { className: "bc-ask-option-desc", children: opt.description }))] })] }, oi));
                                }) })] }, qi));
                }) }), _jsxs("div", { className: "bc-pending-actions", children: [_jsx("button", { type: "button", className: "bc-pending-allow", disabled: busy || !allAnswered, onClick: submit, children: "Submit" }), _jsx("button", { type: "button", className: "bc-pending-deny", disabled: busy, onClick: decline, children: "Decline" })] }), error && _jsx("p", { className: "bc-pending-error", children: error })] }));
}
function PendingHookCard({ hook, onResolve, apiFetch, permStoreBase, }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const requestId = hook.request_id || '';
    const tool = hook.tool_name || '';
    const isBash = tool === 'Bash';
    const command = isBash ? String(hook.input?.command ?? '') : '';
    const firstWord = isBash ? (command.trim().split(/\s+/)[0] || '') : '';
    const inputPreview = isBash
        ? command || '(empty command)'
        : JSON.stringify(hook.input ?? {}, null, 2);
    const resolveOnce = useCallback(async (behavior) => {
        if (!requestId)
            return;
        setBusy(true);
        setError(null);
        try {
            await onResolve({ requestId, behavior, resolvedBy: 'user' });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [requestId, onResolve]);
    const resolveAlways = useCallback(async (behavior) => {
        if (!requestId || !tool)
            return;
        setBusy(true);
        setError(null);
        try {
            const pattern = isBash && firstWord ? `^${escapeRegex(firstWord)}\\b` : '';
            const ruleBody = {
                scope: 'global',
                priority: 200,
                tool,
                pattern,
                outcome: behavior,
                message: `auto-created from approval banner: ${behavior} ${tool}${pattern ? ' ' + pattern : ''}`,
                enabled: true,
            };
            const res = await apiFetch(`${permStoreBase}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ruleBody),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`rule create failed: HTTP ${res.status} ${text}`);
            }
            await onResolve({
                requestId,
                behavior,
                resolvedBy: behavior === 'allow' ? 'allow_always' : 'always_deny',
            });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }, [requestId, tool, isBash, firstWord, apiFetch, permStoreBase, onResolve]);
    const alwaysLabel = isBash && firstWord ? firstWord : tool || 'this';
    return (_jsxs("div", { className: "bc-pending-card", children: [_jsxs("div", { className: "bc-pending-card-header", children: [_jsx("strong", { className: "bc-pending-tool", children: tool || hook.event || 'tool call' }), _jsx("span", { className: "bc-pending-event", children: hook.event })] }), _jsx("pre", { className: "bc-pending-input", children: inputPreview }), _jsxs("div", { className: "bc-pending-actions", children: [_jsx("button", { type: "button", className: "bc-pending-allow", disabled: busy, onClick: () => resolveOnce('allow'), children: "Allow once" }), _jsx("button", { type: "button", className: "bc-pending-deny", disabled: busy, onClick: () => resolveOnce('deny'), children: "Deny" }), _jsxs("button", { type: "button", className: "bc-pending-always-allow", disabled: busy, onClick: () => resolveAlways('allow'), title: `Create a global rule that auto-allows future "${alwaysLabel}" calls`, children: ["Always allow ", alwaysLabel] }), _jsxs("button", { type: "button", className: "bc-pending-always-deny", disabled: busy, onClick: () => resolveAlways('deny'), title: `Create a global rule that auto-denies future "${alwaysLabel}" calls`, children: ["Always deny ", alwaysLabel] })] }), error && _jsx("p", { className: "bc-pending-error", children: error })] }));
}
// escapeRegex turns a plain string into a literal regex match. Used so a
// command like `git status` becomes `^git\b` not `^git\b` after extra
// metacharacter processing.
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=PendingPermissionsBanner.js.map