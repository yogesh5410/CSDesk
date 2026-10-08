import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // Without this the browser just gets a bare 502 when the API is not
        // running, which says nothing about the cause. Answer with JSON the
        // client already knows how to surface.
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            const message =
              err.code === 'ECONNREFUSED'
                ? `API server is not running at ${API_TARGET}. Start it with: cd server && npm run dev`
                : `Could not reach the API at ${API_TARGET} (${err.code || err.message}).`

            console.error(`\n[proxy] ${message}\n`)

            if (res.writableEnded) return
            if (typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
            }
            if (typeof res.end === 'function') {
              res.end(JSON.stringify({ error: message }))
            } else {
              res.destroy?.()
            }
          })
        },
      },
    },
  },
})
