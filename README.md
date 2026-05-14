# @kayushkin/bridge-ui

Reusable React component library for apps that consume an [llm-bridge-server](https://github.com/kayushkin/llm-bridge-server) backend. Ships the chat surface, session/instance/auth/usage/skills/conformance pages, plus the underlying SSE client and React hooks — so a host app only has to wire auth and routes.

The simplest way to get a working UI on top of llm-bridge-server is to run the server directly — it embeds bridge-ui's built `dist/` and serves it at the root. Embed this package in your own React app if you want to customize the host (chrome, auth, routing).

## Install

```bash
npm install @kayushkin/bridge-ui
```

Peer dependencies (host app must provide):

- `react` ≥ 18
- `react-dom` ≥ 18
- `react-router-dom` ≥ 6

The library is ESM-only (`"type": "module"`) and ships its own stylesheet at `@kayushkin/bridge-ui/styles.css`.

## Usage

Wrap the bridge area in a `BridgeProvider` and mount `BridgeLayout` (or the page components individually) under your router.

```tsx
import { Routes, Route } from 'react-router-dom'
import {
  BridgeProvider,
  BridgeLayout,
  BridgeChat,
  BridgeInstances,
  BridgeSessions,
  BridgeAuth,
  BridgeUsage,
  BridgeSettings,
  BridgeSkills,
  BridgeConformance,
} from '@kayushkin/bridge-ui'
import '@kayushkin/bridge-ui/styles.css'

// Your auth'd fetch — adds cookies, bearer tokens, etc. before every request.
const apiFetch: typeof fetch = (url, init) =>
  fetch(url, { credentials: 'include', ...init })

export default function App() {
  return (
    <Routes>
      <Route
        path="bridge"
        element={
          <BridgeProvider
            fetch={apiFetch}
            basePath="/api/bridge"
            skillStoreBasePath="/api/skill-store"
          >
            <BridgeLayout />
          </BridgeProvider>
        }
      >
        <Route index element={<BridgeChat />} />
        <Route path="instances" element={<BridgeInstances />} />
        <Route path="sessions" element={<BridgeSessions />} />
        <Route path="auth" element={<BridgeAuth />} />
        <Route path="usage" element={<BridgeUsage />} />
        <Route path="settings" element={<BridgeSettings />} />
        <Route path="skills" element={<BridgeSkills />} />
        <Route path="conformance" element={<BridgeConformance />} />
      </Route>
    </Routes>
  )
}
```

`BridgeProvider` is the single configuration point. Every hook and page component pulls its `fetch`, `basePath`, and route map from context — components never read globals or hit a hardcoded URL.

### `BridgeProvider` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fetch` | `(url, init?) => Promise<Response>` | required | Auth'd fetch function. Add cookies / bearer tokens here. |
| `basePath` | `string` | `/api/bridge` | Base path for the llm-bridge-server API (no trailing slash). |
| `skillStoreBasePath` | `string` | `""` | Base path for skill-store API. If empty, the Skills tab is hidden. |
| `routes` | `Partial<BridgeRoutes>` | `DEFAULT_BRIDGE_ROUTES` | Override individual route paths used by inter-page navigation. |

`DEFAULT_BRIDGE_ROUTES` is exported for inspection/extension:

```ts
{
  chat:        '/bridge',
  instances:   '/bridge/instances',
  sessions:    '/bridge/sessions',
  auth:        '/bridge/auth',
  usage:       '/bridge/usage',
  settings:    '/bridge/settings',
  skills:      '/bridge/skills',
  conformance: '/bridge/conformance',
}
```

## Exports

### Page components

| Component | Purpose |
|-----------|---------|
| `BridgeLayout` | Outer shell with the tab nav. Renders the `<Outlet/>` of nested routes. |
| `BridgeChat` | Active chat surface: timeline, composer, session list, tools panel, workspace pane. |
| `BridgeSessions` | Session browser across all instances/harnesses. |
| `BridgeInstances` | Instance + machine management (create, edit, bind credentials). |
| `BridgeAuth` | Credential management (Anthropic, OpenAI, Google, etc.). |
| `BridgeUsage` | Token / cost rollups across sessions. |
| `BridgeSettings` | User-level prefs (default model, layout, etc.). |
| `BridgeSkills` | Skill-store browser — hidden when `skillStoreBasePath` is empty. |
| `BridgeConformance` | Per-harness conformance matrix (which features pass). |

### Hooks

| Hook | Returns | Notes |
|------|---------|-------|
| `useBridgeConfig()` | `BridgeConfig` | The current provider config. Throws if not under `BridgeProvider`. |
| `useBridgeSession()` | `UseBridgeSessionReturn` | List/create/select sessions, send messages, interrupt/resume/stop, fork, compact, send config, live `LogRow[]` from SSE. |
| `useBridgeInstances()` | `{ instances, loading, error, ... }` | Polls `/instances` every 30 s; create/update/delete helpers. |
| `useBridgeMachines()` | `{ machines, loading, error, ... }` | Host registry instances bind to. Same poll-and-snapshot shape as instances. |
| `useBridgePrefs(opts?)` | `[prefs, setPrefs]`-style object | Server-synced (when `fetch`+`endpoint` provided) or `localStorage`-only. |
| `useBridgeFolders()` | `UseBridgeFoldersReturn` | Folder ordering + session→folder assignment. |
| `useStickyBottomScroll(ref)` | `StickyBottomScroll` | Auto-stick chat scroll to bottom unless the user scrolls up. |

### SSE & utilities

- `connectSSE(fetch, basePath, sessionId, lastEventId?, signal?)` — async generator yielding `BridgeEvent`s. Used internally by `useBridgeSession`; exposed for consumers that need raw event streams.
- `formatTokens`, `formatCost`, `formatDuration`, `timeAgo` — display helpers used by the built-in components.
- `TRANSPORT_LABEL` — display name lookup for credential transports.

### Tool renderers

The Tools panel renders `ToolEvent`s through a registry. Built-in renderers cover File reads, Edit, Bash, Grep, and Web tools; everything else falls back to `DefaultRenderer`. Register custom renderers from your host app:

```tsx
import { registerToolRenderer, type ToolRendererProps } from '@kayushkin/bridge-ui'

function MyToolRenderer({ tool, running }: ToolRendererProps) {
  return <pre>{JSON.stringify(tool.input, null, 2)}</pre>
}

registerToolRenderer('MyTool', MyToolRenderer)
```

`getToolRenderer(name)` resolves a renderer by tool name, returning `DefaultRenderer` if none is registered.

### Types

All canonical types come from `@kayushkin/llm-bridge-types` (auto-generated from the Go structs in `llm-bridge/msg/`) and are re-exported here. UI-specific types (`Message`, `LogRow`, `BridgeEvent`, `SessionUIState`, `ActivityKind`, `UseBridgeSessionReturn`, etc.) are defined in `src/types.ts`.

Do **not** copy these types into your host app — they are a single source of truth for the wire protocol; importing them from this package keeps host code in lock-step with the server.

## Architecture

```
Host app
  │
  ├─ <BridgeProvider fetch=… basePath=… skillStoreBasePath=…>
  │     │
  │     ├─ <BridgeLayout/>       ← outer shell + tab nav
  │     │   └─ <Outlet/>          ← nested route renders one of:
  │     │       BridgeChat | BridgeSessions | BridgeInstances |
  │     │       BridgeAuth | BridgeUsage | BridgeSettings |
  │     │       BridgeSkills | BridgeConformance
  │     │
  │     └─ hooks read config from BridgeContext:
  │         useBridgeSession   → /sessions, /events (SSE), /send, /interrupt, …
  │         useBridgeInstances → /instances
  │         useBridgeMachines  → /machines
  │         useBridgeFolders   → /folders
  │         useBridgePrefs     → /session-meta/bridge (or localStorage)
  │
  └─ apiFetch — host's job: cookies, bearer tokens, error handling
```

The library never opens a connection that isn't routed through the host's `fetch`. SSE uses fetch + `ReadableStream` (rather than the native `EventSource`) so the same auth applies to chat events as to REST calls.

## Build / dev

```bash
npm install
npm run build    # tsc → dist/
npm run dev      # tsc --watch
```

`tsconfig.json` emits ESM (`module: ESNext`) with declarations and source maps into `dist/`. The published package contains `dist/` and `styles.css` only (`files` field in `package.json`).

## License

[Apache License 2.0](./LICENSE).
