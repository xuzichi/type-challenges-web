import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * GitHub Pages base path resolution, in priority order:
 *  1. VITE_BASE (set by CI from actions/configure-pages `base_path`)
 *  2. GITHUB_REPOSITORY  -> "/<repo>/" (project page), "/" for <user>.github.io
 *  3. "/" (local dev / preview)
 */
function resolveBase(): string {
  const explicit = process.env.VITE_BASE
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`

  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repo) return '/'
  if (repo.endsWith('.github.io')) return '/'
  return `/${repo}/`
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['monaco-editor', '@monaco-editor/react'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
  },
})
