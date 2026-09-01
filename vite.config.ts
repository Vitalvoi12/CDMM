import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { ClientRequest, IncomingMessage } from 'node:http'

const CALDAV_PREFIX = '/caldav/'

/**
 * Dev-time CalDAV proxy. Browser can't call a remote CalDAV server directly
 * (CORS). Requests are routed to `/caldav/<base64url(origin)>/<dav-path>`
 * on the same origin; this middleware forwards them server-side.
 */
function caldavProxy(): Plugin {
  return {
    name: 'caldav-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(CALDAV_PREFIX)) return next()

        const rest = req.url.slice(CALDAV_PREFIX.length)
        const slash = rest.indexOf('/')
        const b64 = slash === -1 ? rest : rest.slice(0, slash)
        const davPath = slash === -1 ? '/' : rest.slice(slash)

        let targetOrigin = ''
        try {
          targetOrigin = Buffer.from(b64, 'base64url').toString('utf8')
        } catch {
          return next()
        }
        if (!/^https?:\/\//.test(targetOrigin)) return next()

        const target = new URL(targetOrigin + davPath)
        const clientFn = target.protocol === 'https:' ? httpsRequest : httpRequest

        const headers: Record<string, string | string[] | number | undefined> = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (k === 'host') continue
          if (v !== undefined) headers[k] = v as string | string[]
        }

        const proxyReq: ClientRequest = clientFn(
          target,
          {
            method: (req.method || 'GET').toUpperCase(),
            headers,
          },
          (proxyRes: IncomingMessage) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
            proxyRes.pipe(res)
          }
        )

        proxyReq.on('error', (err) => {
          res.statusCode = 502
          res.setHeader('Content-Type', 'text/plain')
          res.end(`CalDAV proxy error: ${err.message}`)
        })

        if (req.pipe) req.pipe(proxyReq)
        else proxyReq.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), caldavProxy()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})