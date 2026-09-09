import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Bridge } from '@kayushkin/bridge-ui'

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

// The whole bridge at the root. It routes its own pages; nothing else is mounted.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Bridge
        fetch={apiFetch}
        basePath={BASE}
        skillStoreBasePath="/api/skill-store"
        toolStoreBasePath="/api/tool-store"
        kanbanStoreBasePath="/api/kanban"
        principalStoreBasePath="/api/principals"
      />
    </BrowserRouter>
  </StrictMode>,
)
