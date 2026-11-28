import { assistantConfirmation, executeAssistantCommand, getAssistantHistory, interpretAssistantCommand } from './assistant.mjs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import geminiVoices from './gemini-voices.json' with { type: 'json' };
import { focusCommand } from './focus.mjs';
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
const assistantLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const transcriptionLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const speechLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const pairLimiter = rateLimit({ windowMs: 60_000, max: 10 });

async function synthesizeSpeech({ model, voice, input, responseFormat, signal }) {
  const audio = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input, response_format: responseFormat }),
  });
  const mediaType = audio.headers.get('content-type')?.split(';')[0];
  if (!audio.ok || (responseFormat === 'wav' ? mediaType !== 'audio/wav' : !mediaType?.startsWith('audio/'))) {
    await audio.body?.cancel();
    throw new Error(`Speech provider returned HTTP ${audio.status} (${mediaType})`);
  }
  const samples = Buffer.from(await audio.arrayBuffer());
  if (!samples.length) throw new Error('Empty speech response');
  if (responseFormat === 'mp3') return samples;

  return new Promise((resolve, reject) => {
    const encoder = execFile('ffmpeg', [
      '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0',
      '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1',
    ], { encoding: 'buffer', signal, maxBuffer: 4 * 1024 * 1024 }, (error, mp3) => {
      if (error) reject(error);
      else resolve(mp3);
    });
    encoder.stdin.on('error', reject);
    encoder.stdin.end(samples);
  });
}

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

  if (pathname === '/api/assistant/transcribe' && method === 'POST') {
    if (!transcriptionLimiter(userId)) return sendJson(res, 429, { error: 'Too many requests' }), true;
    try {
      const { pcm } = await readBody(req);
      if (typeof pcm !== 'string' || pcm.length > 640000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pcm)) {
        return sendJson(res, 400, { error: 'Invalid recording' }), true;
      }
      const samples = Buffer.from(pcm, 'base64');
      if (!samples.length || samples.length % 2 || samples.toString('base64') !== pcm) {
        return sendJson(res, 400, { error: 'Invalid recording' }), true;
      }
      // PCM16, mono, 16 kHz. Construct the header here to enforce the duration limit.
      const wav = Buffer.alloc(44 + samples.length);
      wav.write('RIFF');
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(16000, 24);
      wav.writeUInt32LE(32000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(samples.length, 40);
      samples.copy(wav, 44);
      const transcribe = model => fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, language: 'ru',
          input_audio: { data: wav.toString('base64'), format: 'wav' } }),
      });
      let upstream = await transcribe('microsoft/mai-transcribe-2');
      if (upstream.status === 429 || upstream.status >= 500) {
        await upstream.body?.cancel();
        upstream = await transcribe('elevenlabs/scribe-v2');
      }
      if (!upstream.ok) throw Error();
      const { text } = await upstream.json();
      if (typeof text !== 'string' || text.length > 1000) throw Error();
      return sendJson(res, 200, { text: text.trim() }), true;
    } catch (error) {
      return sendJson(res, error.status || 503, { error: 'Распознавание записи недоступно' }), true;
    }
  }

  if (pathname === '/api/assistant/speech' && method === 'POST') {
    if (!speechLimiter(userId)) return sendJson(res, 429, { error: 'Too many requests' }), true;
    try {
      const { id } = await readBody(req);
      const row = typeof id === 'string' && db.prepare('SELECT result FROM assistant_requests WHERE user_id = ? AND id = ?').get(userId, id);
      if (!row) return sendJson(res, 404, { error: 'Ответ не найден' }), true;
      const reply = JSON.parse(row.result);
      const parts = reply.list?.items?.length ? [
        reply.list.title, ...reply.list.items.map(item => item.text),
        ...(reply.list.remaining ? ['И ещё ' + reply.list.remaining] : []),
      ] : [reply.message];
      const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      const minuteForm = new Intl.PluralRules('ru');
      const narration = parts.join('. ').replace(/в TODO/g, 'в списке задач').replace(/TODO/g, 'туду')
        .replace(/ · /g, ', ')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, value => {
          const date = new Date(value + 'T12:00Z');
          return Number.isFinite(+date) ? dateFormat.format(date).replace(/ г\.$/, ' года') : value;
        })
        .replace(/(\d+) мин(?![а-яё])/giu, (_, n) => n + ' ' + ({ one: 'минута', few: 'минуты' }[minuteForm.select(+n)] ?? 'минут'));
      const settings = db.prepare('SELECT data FROM settings WHERE user_id = ?').get(userId);
      const selected = settings && JSON.parse(settings.data)?.assistantVoice;
      const voice = geminiVoices.includes(selected) ? selected : process.env.CDMM_GEMINI_VOICE || 'Kore';
      const input = narration.length > 2400
        ? narration.slice(0, 2250).replace(/\s+\S*$/, '') + '. Продолжение на экране.' : narration;
      const mp3 = await synthesizeSpeech({
        model: 'google/gemini-3.8-flash-lite-tts',
        voice, input, responseFormat: 'wav',
        signal: AbortSignal.timeout(16000),
      });
      return sendJson(res, 200, { mp3: mp3.toString('base64') }), true;
    } catch {
      return sendJson(res, 503, { error: 'Озвучка временно недоступна' }), true;
    }
  }

  if (['/api/assistant/preview', '/api/assistant/command'].includes(pathname) && method === 'POST') {
    if (!assistantLimiter(userId)) return sendJson(res, 429, { error: 'Too many requests' }), true;
    try {
      const body = await readBody(req);
      if (pathname.endsWith('/preview')) {
        return sendJson(res, 200, await interpretAssistantCommand(body)), true;
      }
      if (typeof body?.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id)) {
        return sendJson(res, 400, { error: 'Expected a request UUID' }), true;
      }
      if (typeof body.timeZone !== 'string' || !body.timeZone || body.timeZone.length > 100) {
        return sendJson(res, 400, { error: 'Expected an IANA time zone' }), true;
      }
      const cached = db.prepare('SELECT 1 FROM assistant_requests WHERE user_id = ? AND id = ?').get(userId, body.id);
      const command = cached ? null : assistantConfirmation(body.text) ?? await interpretAssistantCommand(body, {
        history: typeof body.timeZone === 'string' ? getAssistantHistory(db, userId, body.timeZone) : [],
      });
      const result = executeAssistantCommand(db, userId, command, body.timeZone ?? null, body.id, body.text ?? null);
      return sendJson(res, 200, result), true;
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.status ? e.message : 'Assistant preview failed' }), true;
    }
  }

  if (pathname === '/api/glance' && method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams;
    return sendJson(res, 200, getGlance(db, userId, Date.now(), params.get('day'), params.get('timeZone'))), true;
  }

  if (pathname === '/api/focus' && method === 'POST') {
    let body;
    try {
      body = await readBody(req);
      return sendJson(res, 200, focusCommand(db, userId, body)), true;
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.status ? e.message : 'Could not save session' }), true;
    }
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
