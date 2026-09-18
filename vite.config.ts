import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cubeDocsPublisherPlugin } from './scripts/docs-publisher.js'

const proxy = {
  '/scryfall-data': {
    target: 'https://data.scryfall.io',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/scryfall-data/, ''),
  },
  '/cobra-data': {
    target: 'https://cubecobra-public.s3.amazonaws.com',
    changeOrigin: true,
    timeout: 0,
    proxyTimeout: 0,
    rewrite: (path: string) => path.replace(/^\/cobra-data/, ''),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cubeDocsPublisherPlugin()],
  optimizeDeps: {
    exclude: ['highs'],
  },
  worker: {
    format: 'es',
  },
  server: {
    proxy,
    watch: {
      ignored: ['**/docs/**'],
    },
  },
  preview: { proxy },
})
