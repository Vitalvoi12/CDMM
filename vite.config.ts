import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The SQLite database lives in ./data and changes on every API request —
    // it must not trigger HMR full-reloads (that was an infinite reload loop).
    watch: {
      ignored: ['**/data/**', '**/*.db*'],
    },
    // In dev the API is served by `node server.mjs` on API_PORT.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 5175}`,
        changeOrigin: true,
      },
    },
  },
})
