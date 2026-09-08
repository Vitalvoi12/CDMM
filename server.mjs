import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, 'dist')
const PORT = Number(process.env.PORT || 5173)
const CALDAV_PREFIX = '/caldav/'

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

function caldavProxy(req, res, url) {
  const rest = url.slice(CALDAV_PREFIX.length)
  const slash = rest.indexOf('/')
  const b64 = slash === -1 ? rest : rest.slice(0, slash)
  const davPath = slash === -1 ? '/' : rest.slice(slash)

  let targetOrigin = ''
  try {
    targetOrigin = Buffer.from(b64, 'base64url').toString('utf8')
  } catch {
    return send(req, res, 400, { 'Content-Type': 'text/plain' }, 'Bad proxy path')
  }
  if (!/^https?:\/\//.test(targetOrigin)) {
    return send(req, res, 400, { 'Content-Type': 'text/plain' }, 'Bad proxy origin')
  }

  const target = new URL(targetOrigin + davPath)
  const clientFn = target.protocol === 'https:' ? httpsRequest : httpRequest

  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === 'host') continue
    // Nextcloud rejects write requests (PUT/DELETE) with a foreign Origin
    // header (CSRF check) — strip browser context headers.
    if (k === 'origin' || k === 'referer') continue
    if (v !== undefined) headers[k] = v
  }

  const proxyReq = clientFn(
    target,
    { method: (req.method || 'GET').toUpperCase(), headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', (err) => {
    send(req, res, 502, { 'Content-Type': 'text/plain' }, `CalDAV proxy error: ${err.message}`)
  })

  if (req.pipe) req.pipe(proxyReq)
  else proxyReq.end()
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
  if (req.url.startsWith(CALDAV_PREFIX)) return caldavProxy(req, res, req.url)
  return serveStatic(req, res, req.url)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CDMM serving ${ROOT} on http://0.0.0.0:${PORT}`)
})