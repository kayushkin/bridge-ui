import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ChatProvider } from '@kayushkin/chat-core';
import { BridgeProvider } from '../provider';
import { useBridgeConfig } from '../context';
import { BridgeLayout } from './BridgeLayout';
import { BridgeChat } from './chat/BridgeChat';
import { BridgeInstances } from './BridgeInstances';
import { BridgeSessions } from './BridgeSessions';
import { BridgeAuth } from './BridgeAuth';
import { BridgeUsage } from './BridgeUsage';
import { BridgeSettings } from './BridgeSettings';
import { BridgeAgents } from './BridgeAgents';
import { BridgeFiles } from './BridgeFiles';
import { BridgeSkills } from './BridgeSkills';
import { BridgeTools } from './BridgeTools';
import { BridgePermissions } from './BridgePermissions';
import { BridgeKanban } from './BridgeKanban';
import { BridgePrincipals } from './BridgePrincipals';
import { BridgeConformance } from './BridgeConformance';
import { BridgeCardPage } from './BridgeCardPage';
import { BridgeOrchestrator } from './BridgeOrchestrator';
/** The bridge, whole: every page this library ships, its tab row, and the two
 *  providers they read — mounted by a host as ONE thing at the root of a router.
 *
 *  dash mounts it under a splat route and puts its own pages beside it; the
 *  standalone launcher mounts nothing else. Either way this component owns its
 *  host's root: the routes in `DEFAULT_BRIDGE_ROUTES` are what it renders, so a
 *  `?session=` deeplink, a card link or a reference chip built from them lands on
 *  a page this component serves. A host that instead composes pages by hand
 *  under a prefix passes `BridgeProvider` its own `routes` and does not use this.
 *
 *  `ChatProvider` sits above the router on purpose. It is chat-core's session
 *  store and sync engine, and holding it here rather than inside the chat page
 *  means the store survives a switch to Instances or Kanban and back — and that
 *  every page can render a reference chip, which throws without it. */
export function Bridge({ notesPath = '', showConformance, ...provider }) {
    const routes = useMemo(() => ({ notes: notesPath }), [notesPath]);
    return (_jsx(BridgeProvider, { ...provider, routes: routes, children: _jsx(ChatStore, { children: _jsx(Routes, { children: _jsxs(Route, { element: _jsx(BridgeLayout, { showConformance: showConformance }), children: [_jsx(Route, { index: true, element: _jsx(BridgeChat, {}) }), _jsx(Route, { path: "instances", element: _jsx(BridgeInstances, {}) }), _jsx(Route, { path: "sessions", element: _jsx(BridgeSessions, {}) }), _jsx(Route, { path: "auth", element: _jsx(BridgeAuth, {}) }), _jsx(Route, { path: "usage", element: _jsx(BridgeUsage, {}) }), _jsx(Route, { path: "settings", element: _jsx(BridgeSettings, {}) }), _jsx(Route, { path: "agents", element: _jsx(BridgeAgents, {}) }), _jsx(Route, { path: "files", element: _jsx(BridgeFiles, {}) }), _jsx(Route, { path: "skills", element: _jsx(BridgeSkills, {}) }), _jsx(Route, { path: "tools", element: _jsx(BridgeTools, {}) }), _jsx(Route, { path: "permissions", element: _jsx(BridgePermissions, {}) }), _jsx(Route, { path: "kanban", element: _jsx(BridgeKanban, {}) }), _jsx(Route, { path: "card/:cardId", element: _jsx(BridgeCardPage, {}) }), _jsx(Route, { path: "principals", element: _jsx(BridgePrincipals, {}) }), _jsx(Route, { path: "orchestrator", element: _jsx(BridgeOrchestrator, {}) }), _jsx(Route, { path: "conformance", element: _jsx(BridgeConformance, {}) })] }) }) }) }));
}
/** chat-core's provider, fed from the same `BridgeConfig` every page reads, so
 *  the chat reaches noteboard and the resolver through whatever the host proxies. */
function ChatStore({ children }) {
    const { fetch: fetchFn, basePath, noteboardBasePath, resolveEndpoint } = useBridgeConfig();
    const chatFetch = useMemo(() => chatFetchOver(fetchFn), [fetchFn]);
    return (_jsx(ChatProvider, { fetch: chatFetch, basePath: basePath, noteboardBasePath: noteboardBasePath, resolveEndpoint: resolveEndpoint, children: children }));
}
// Adapt the host's fetch (bridge-ui's `FetchFn`, string-only) to the full
// `typeof fetch` signature ChatProvider expects. ApiClient only ever passes string
// URLs, but URL/Request are covered too so the types are honest.
function chatFetchOver(fetchFn) {
    return (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return fetchFn(url, init);
    };
}
//# sourceMappingURL=Bridge.js.map