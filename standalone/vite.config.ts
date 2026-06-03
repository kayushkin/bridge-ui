import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// Standalone launcher for @kayushkin/bridge-ui.
//
//   npm start            → dev server, proxies /api/* to local backends
//   npm run build:standalone → static bundle in standalone/dist
//
// The alias points the package name at ./src so the launcher tracks source
// directly and needs no prior `npm run build`. Override the bridge target
// without the proxy via VITE_BRIDGE_BASE (e.g. an absolute URL).
export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: {
      '@kayushkin/bridge-ui': resolve(here, '../src/index.ts'),
    },
  },
  server: {
    // Backends serve their own canonical paths (bridge-server handles
    // /sessions, skill-store handles /skills, …), so the prefix is stripped
    // before forwarding — mirroring dash-server's reverse proxies.
    proxy: {
      '/api/bridge': {
        target: 'http://localhost:8160',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api\/bridge/, '') || '/',
      },
      '/api/skill-store': {
        target: 'http://localhost:8301',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/skill-store/, '') || '/',
      },
      '/api/tool-store': {
        target: 'http://localhost:8302',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/tool-store/, '') || '/',
      },
      '/api/kanban': {
        target: 'http://localhost:8305',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kanban/, '') || '/',
      },
    },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
  },
})
