import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { openDb } from './server/db.mjs'
import { handleApi } from './server/api.mjs'
import { cleanupExpiredSessions } from './server/auth.mjs'
import { initPush, startPushScheduler } from './server/push.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, 'dist')
// API_PORT is used in dev (vite proxies /api there); in prod PORT serves everything.
const PORT = Number(process.env.API_PORT || process.env.PORT || 5173)
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')

const db = openDb(DATA_DIR)
// Web Push reminders: key pair lives next to the DB; failures leave the app
// working with in-page reminders only.
try {
  initPush(DATA_DIR)
  startPushScheduler(db)
} catch (err) {
  console.error('[push] disabled:', err)
}
// Opportunistic cleanup of expired sessions (cheap, indexed delete).
setInterval(() => {
  try { cleanupExpiredSessions(db) } catch { /* ignore */ }
}, 3600_000).unref()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function send(req, res, status, headers = {}, body = '') {
  res.writeHead(status, headers)
  res.end(body)
}

async function serveStatic(req, res, urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0])
  if (pathname.includes('\0')) return send(req, res, 400)

  let filePath = normalize(join(ROOT, pathname))
  if (!filePath.startsWith(ROOT)) return send(req, res, 403)

  const hasExtension = extname(filePath) !== ''
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
  } catch {
    if (!hasExtension) {
      filePath = join(ROOT, 'index.html')
    } else {
      return send(req, res, 404, { 'Content-Type': 'text/plain' }, 'Not found')
    }
  }

  try {
    const data = await readFile(filePath)
    const html = filePath.endsWith('index.html')
    send(req, res, 200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': html ? 'no-cache' : 'public, max-age=31536000, immutable',
    }, data)
  } catch {
    send(req, res, 404, { 'Content-Type': 'text/plain' }, 'Not found')
  }
}

const server = createServer((req, res) => {
  if (!req.url) return send(req, res, 400)
  const pathname = req.url.split('?')[0]
  if (pathname.startsWith('/api/')) {
    handleApi(db, req, res, pathname).catch((err) => {
      console.error('[api]', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Internal error' }))
      }
    })
    return
  }
  return serveStatic(req, res, req.url)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CDMM serving ${ROOT} on http://0.0.0.0:${PORT}`)
})