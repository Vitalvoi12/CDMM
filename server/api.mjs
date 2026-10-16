import { randomUUID } from 'node:crypto';
import {
  userHasData, getState, importSnapshot, applyChanges, getChanges, getCursor,
} from './db.mjs';
import {
  USERNAME_RE, MIN_PASSWORD_LEN, hashPassword, verifyPassword,
  createSessionToken, lookupSession, deleteSession, touchSession, bearerToken, rateLimit,
} from './auth.mjs';
import { vapidPublicKey, pushToUser } from './push.mjs';
import { getGlance, setTodoDone, startPairing, confirmPairing, pollPairing } from './glance.mjs';

const MAX_BODY = 5 * 1024 * 1024; // 5 MB

const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const registerLimiter = rateLimit({ windowMs: 3600_000, max: 20 });
const pairLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject({ status: 413, message: 'Body too large' });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject({ status: 400, message: 'Invalid JSON' });
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function validateUsername(username) {
  return typeof username === 'string' && USERNAME_RE.test(username.trim());
}

export async function handleApi(db, req, res, pathname) {
  if (!pathname.startsWith('/api/')) return false;
  const method = (req.method || 'GET').toUpperCase();

  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/register' && method === 'POST') {
    if (!registerLimiter(clientIp(req))) return sendJson(res, 429, { error: 'Too many requests' }), true;
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!validateUsername(username)) return sendJson(res, 400, { error: 'Username must be 3-32 chars: letters, digits, _ or -' }), true;
    if (password.length < MIN_PASSWORD_LEN) return sendJson(res, 400, { error: `Password must be at least ${MIN_PASSWORD_LEN} characters` }), true;
    if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
      return sendJson(res, 409, { error: 'Username is taken' }), true;
    }
    const { salt, hash } = hashPassword(password);
    const id = randomUUID();
    db.prepare('INSERT INTO users (id, username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, username, hash, salt, Date.now()
    );
    const token = createSessionToken(db, id);
    return sendJson(res, 201, { token, username }), true;
  }

  if (pathname === '/api/login' && method === 'POST') {
    if (!loginLimiter(clientIp(req))) return sendJson(res, 429, { error: 'Too many requests' }), true;
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = username ? db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) : null;
    if (!user || !verifyPassword(password, user.salt, user.pass_hash)) {
      // Constant-ish failure path; scrypt in verifyPassword keeps timing even.
      return sendJson(res, 401, { error: 'Invalid username or password' }), true;
    }
    const token = createSessionToken(db, user.id);
    return sendJson(res, 200, { token, username: user.username }), true;
  }

  // Watch pairing: the watch has no account yet, so these two are open.
  if (pathname === '/api/pair/start' && method === 'POST') {
    if (!pairLimiter(clientIp(req))) return sendJson(res, 429, { error: 'Too many requests' }), true;
    return sendJson(res, 200, startPairing()), true;
  }

  if (pathname === '/api/pair/poll' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    const result = pollPairing(typeof body.pairId === 'string' ? body.pairId : '');
    if (result === 'expired') return sendJson(res, 410, { error: 'Code expired' }), true;
    if (result === 'pending') return sendJson(res, 202, { pending: true }), true;
    return sendJson(res, 200, result), true;
  }

  // ---- authenticated routes ----
  const userId = lookupSession(db, bearerToken(req));
  if (!userId) return sendJson(res, 401, { error: 'Unauthorized' }), true;
  touchSession(db, bearerToken(req));

  if (pathname === '/api/logout' && method === 'POST') {
    // A signed-out device must stop getting this account's reminders.
    let body = {};
    try { body = await readBody(req); } catch { /* logout regardless */ }
    if (typeof body.pushEndpoint === 'string') {
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(body.pushEndpoint, userId);
    }
    deleteSession(db, bearerToken(req));
    return sendJson(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/me' && method === 'GET') {
    const user = db.prepare('SELECT username, created_at FROM users WHERE id = ?').get(userId);
    return sendJson(res, 200, { username: user.username, createdAt: user.created_at }), true;
  }

  if (pathname === '/api/state' && method === 'GET') {
    return sendJson(res, 200, getState(db, userId)), true;
  }

  if (pathname === '/api/import' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    try {
      importSnapshot(db, userId, body);
      return sendJson(res, 200, { ok: true, cursor: getCursor(db, userId) }), true;
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.message || 'Import failed' }), true;
    }
  }

  if (pathname === '/api/sync' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    const cursor = Number(body?.cursor) || 0;
    let forced = [];
    try {
      if (body?.dirty) forced = applyChanges(db, userId, body.dirty).forced || [];
    } catch (e) {
      return sendJson(res, 400, { error: e.message || 'Bad changes' }), true;
    }
    const out = getChanges(db, userId, cursor);
    if (forced.length > 0) {
      // Records where the sender lost LWW: converge the sender immediately.
      const seen = new Set(out.changes.map((c) => `${c.entity}:${c.key}`));
      for (const f of forced) {
        if (!seen.has(`${f.entity}:${f.key}`)) {
          out.changes.push(f);
          seen.add(`${f.entity}:${f.key}`);
        }
      }
    }
    return sendJson(res, 200, out), true;
  }

  if (pathname === '/api/glance' && method === 'GET') {
    return sendJson(res, 200, getGlance(db, userId)), true;
  }

  if (pathname === '/api/glance/todo' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    if (typeof body.id !== 'string') return sendJson(res, 400, { error: 'Missing id' }), true;
    if (!setTodoDone(db, userId, body.id, body.completed !== false)) return sendJson(res, 404, { error: 'No such task' }), true;
    return sendJson(res, 200, getGlance(db, userId)), true;
  }

  if (pathname === '/api/pair/confirm' && method === 'POST') {
    if (!pairLimiter(`confirm:${userId}`)) return sendJson(res, 429, { error: 'Too many requests' }), true;
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (code.length !== 6 || !confirmPairing(db, userId, user.username, code)) {
      return sendJson(res, 404, { error: 'Wrong or expired code' }), true;
    }
    return sendJson(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/push/key' && method === 'GET') {
    const key = vapidPublicKey();
    if (!key) return sendJson(res, 503, { error: 'Push unavailable' }), true;
    return sendJson(res, 200, { key }), true;
  }

  if (pathname === '/api/push/subscribe' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string') {
      return sendJson(res, 400, { error: 'Invalid subscription' }), true;
    }
    const tz = typeof body.tz === 'string' ? body.tz.slice(0, 64) : null;
    // The public site address (via Caddy) — used as the VAPID contact.
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.slice(0, 200) : null;
    // Upsert by endpoint: a device that changes account moves with it.
    db.prepare(`
      INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, tz, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, origin = excluded.origin
    `).run(endpoint, userId, p256dh, auth, tz, origin, Date.now());
    return sendJson(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/push/unsubscribe' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: e.message || 'Bad request' }), true; }
    if (typeof body.endpoint === 'string') {
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(body.endpoint, userId);
    }
    return sendJson(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/push/test' && method === 'POST') {
    const result = await pushToUser(db, userId, {
      title: 'CDMM',
      body: 'Test reminder — push notifications work.',
      tag: 'cdmm-test',
      url: '/',
    });
    return sendJson(res, 200, result), true;
  }

  return sendJson(res, 404, { error: 'Not found' }), true;
}

export { userHasData };
