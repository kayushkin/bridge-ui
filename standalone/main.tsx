import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import {
  BridgeProvider,
  BridgeLayout,
  BridgeChat,
  BridgeInstances,
  BridgeSessions,
  BridgeAuth,
  BridgeUsage,
  BridgeSettings,
  BridgeAgents,
  BridgeFiles,
  BridgeSkills,
  BridgeTools,
  BridgePermissions,
  BridgeKanban,
  BridgeConformance,
} from '@kayushkin/bridge-ui'

// Default theme (CSS variables) + component styles. The theme import is what
// lets bridge-ui render correctly with no host app providing a palette.
import '../theme.css'
import '../styles.css'

// Auth'd fetch — standalone has no cookie/token layer of its own, so we just
// forward credentials. Point it at a real bridge by setting VITE_BRIDGE_BASE
// (or rely on the dev proxy in vite.config.ts → localhost:8160).
const apiFetch: typeof fetch = (url, init) =>
  fetch(url, { credentials: 'include', ...init })

const BASE = import.meta.env.VITE_BRIDGE_BASE ?? '/api/bridge'

// Root-relative routes so the launcher mounts the chat at "/".
const ROUTES = {
  chat: '/',
  instances: '/instances',
  sessions: '/sessions',
  auth: '/auth',
  usage: '/usage',
  settings: '/settings',
  agents: '/agents',
  files: '/files',
  skills: '/skills',
  tools: '/tools',
  permissions: '/permissions',
  kanban: '/kanban',
  conformance: '/conformance',
}

function App() {
  return (
    <BridgeProvider
      fetch={apiFetch}
      basePath={BASE}
      skillStoreBasePath="/api/skill-store"
      toolStoreBasePath="/api/tool-store"
      kanbanStoreBasePath="/api/kanban"
      routes={ROUTES}
    >
      <Routes>
        <Route element={<BridgeLayout />}>
          <Route index element={<BridgeChat />} />
          <Route path="instances" element={<BridgeInstances />} />
          <Route path="sessions" element={<BridgeSessions />} />
          <Route path="auth" element={<BridgeAuth />} />
          <Route path="usage" element={<BridgeUsage />} />
          <Route path="settings" element={<BridgeSettings />} />
          <Route path="agents" element={<BridgeAgents />} />
          <Route path="files" element={<BridgeFiles />} />
          <Route path="skills" element={<BridgeSkills />} />
          <Route path="tools" element={<BridgeTools />} />
          <Route path="permissions" element={<BridgePermissions />} />
          <Route path="kanban" element={<BridgeKanban />} />
          <Route path="conformance" element={<BridgeConformance />} />
        </Route>
      </Routes>
    </BridgeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
