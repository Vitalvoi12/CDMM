// Web Push for event and todo reminders, built on node:crypto only (the run image
// ships without node_modules):
//   - VAPID (RFC 8292): an ES256 JWT proves the push comes from this server.
//   - Message encryption (RFC 8291, aes128gcm): only the subscribed browser
//     can read the payload; the push service just relays bytes.
// A scheduler looks for reminders coming due and pushes them to every device
// the owner has subscribed, so they arrive even while the app is closed.

import {
  createCipheriv, createECDH, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reminders older than this when noticed are dropped instead of sent late. */
const GRACE_MS = 10 * 60_000;
const TICK_MS = 20_000;
/** Push services keep an undelivered message this long (phone offline). */
const TTL_SECONDS = 30 * 60;
/**
 * VAPID contact. Apple rejects placeholder addresses, so by default it is the
 * site's own https origin, as recorded when the device subscribed.
 */
const SUBJECT = process.env.VAPID_SUBJECT || '';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ---- VAPID keys -----------------------------------------------------------

let vapid = null; // { publicKey: Buffer(65), privateKey: KeyObject }

/** Load the server's VAPID key pair from DATA_DIR, creating it on first run. */
export function initPush(dataDir) {
  const file = join(dataDir, 'vapid.json');
  let jwk;
  if (existsSync(file)) {
    jwk = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
    // Losing this file means every device has to subscribe again — keep it with the DB.
    writeFileSync(file, JSON.stringify(jwk), { mode: 0o600 });
  }
  vapid = {
    privateKey: createPrivateKey({ key: jwk, format: 'jwk' }),
    publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]),
  };
}

/** Public key in the form PushManager.subscribe() expects (base64url, raw point). */
export function vapidPublicKey() {
  return vapid ? b64url(vapid.publicKey) : null;
}

function vapidAuthHeader(endpoint, origin) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: SUBJECT || (origin && /^https:\/\//.test(origin) ? origin : 'mailto:admin@cdmm.app'),
  }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: vapid.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${b64url(vapid.publicKey)}`;
}

// ---- RFC 8291 encryption --------------------------------------------------

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * Encrypt `plaintext` for one subscription. `asKeys`/`salt` are only passed by
 * the test vectors; real sends use a fresh ephemeral key and salt every time.
 */
export function encryptPayload(plaintext, p256dh, authSecret, { asPrivateKey, salt } = {}) {
  const uaPublic = Buffer.from(p256dh, 'base64url');
  const auth = Buffer.from(authSecret, 'base64url');
  const ecdh = createECDH('prime256v1');
  if (asPrivateKey) ecdh.setPrivateKey(Buffer.from(asPrivateKey, 'base64url'));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const saltBuf = salt ? Buffer.from(salt, 'base64url') : randomBytes(16);

  const prkKey = hmac(auth, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(saltBuf, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = padding delimiter of the last (and only) record.
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([saltBuf, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// ---- sending --------------------------------------------------------------

/**
 * Push one JSON message to one subscription. Resolves to 'ok', 'gone' (the
 * subscription is dead and should be deleted) or 'error'.
 */
export async function sendPush(sub, message) {
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthHeader(sub.endpoint, sub.origin),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SECONDS),
        Urgency: 'high',
      },
      body: encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return 'ok';
    if (res.status === 404 || res.status === 410) return 'gone';
    console.error('[push]', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return 'error';
  } catch (err) {
    console.error('[push]', err?.message || err);
    return 'error';
  }
}

/** Send to every device of a user; dead subscriptions are removed. */
export async function pushToUser(db, userId, message) {
  const subs = db.prepare('SELECT endpoint, p256dh, auth, tz, origin FROM push_subscriptions WHERE user_id = ?').all(userId);
  let delivered = 0;
  await Promise.all(subs.map(async (sub) => {
    const result = await sendPush(sub, typeof message === 'function' ? message(sub) : message);
    if (result === 'ok') delivered++;
    else if (result === 'gone') db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
  }));
  return { devices: subs.length, delivered };
}

// ---- reminder scheduler ---------------------------------------------------

function fmtTime(iso, tz) {
  const opts = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: tz || 'UTC' }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(iso));
  }
}

function leadText(minutes) {
  if (minutes === 0) return 'Starting now';
  if (minutes % 60 === 0) return `Starts in ${minutes / 60} h`;
  return `Starts in ${minutes} min`;
}

async function tick(db) {
  const now = Date.now();
  // ISO strings compare in time order; the window is a cheap prefilter, the
  // exact fire time is checked below.
  const rows = db.prepare(`
    SELECT id, user_id, title, start, end, notify_before FROM events
    WHERE notify_before IS NOT NULL AND start >= ? AND start <= ?
      AND user_id IN (SELECT user_id FROM push_subscriptions)
  `).all(new Date(now - GRACE_MS).toISOString(), new Date(now + 2 * 86_400_000).toISOString());

  for (const e of rows) {
    const startMs = Date.parse(e.start);
    if (!Number.isFinite(startMs)) continue;
    const fireAt = startMs - e.notify_before * 60_000;
    if (fireAt > now || now - fireAt > GRACE_MS) continue;
    // Same identity as the client: moving the event or changing the lead
    // makes a new reminder. INSERT OR IGNORE makes each one fire once.
    const key = `${e.id}|${e.start}|${e.notify_before}`;
    const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (user_id, key, at) VALUES (?, ?, ?)').run(e.user_id, key, now);
    if (claimed.changes === 0) continue;
    await pushToUser(db, e.user_id, (sub) => ({
      title: e.title || 'Event',
      body: `${leadText(e.notify_before)} · ${fmtTime(e.start, sub.tz)}–${fmtTime(e.end, sub.tz)}`,
      tag: `cdmm-${key}`,
      url: '/',
    }));
  }

  // Todo reminders: an absolute moment, skipped once the task is done.
  const todos = db.prepare(`
    SELECT id, user_id, title, due_date, remind_at FROM todos
    WHERE remind_at IS NOT NULL AND completed = 0 AND remind_at >= ? AND remind_at <= ?
      AND user_id IN (SELECT user_id FROM push_subscriptions)
  `).all(new Date(now - GRACE_MS).toISOString(), new Date(now).toISOString());

  for (const t of todos) {
    const key = `todo|${t.id}|${t.remind_at}`;
    const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (user_id, key, at) VALUES (?, ?, ?)').run(t.user_id, key, now);
    if (claimed.changes === 0) continue;
    await pushToUser(db, t.user_id, (sub) => ({
      title: t.title || 'Task',
      body: todoBody(t.due_date, sub.tz),
      tag: `cdmm-${key}`,
      url: '/todo',
    }));
  }
}

/** "Task reminder · due Oct 9" — the due time itself is a placeholder, so only the day. */
function todoBody(dueIso, tz) {
  if (!dueIso) return 'Task reminder';
  const opts = { month: 'short', day: 'numeric' };
  let day;
  try {
    day = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz || 'UTC' }).format(new Date(dueIso));
  } catch {
    day = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(dueIso));
  }
  return `Task reminder · due ${day}`;
}

/** Run the reminder loop for the lifetime of the process. */
export function startPushScheduler(db) {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    tick(db).catch((err) => console.error('[push] tick', err)).finally(() => { running = false; });
  };
  setInterval(run, TICK_MS).unref();
  setInterval(() => {
    try { db.prepare('DELETE FROM push_sent WHERE at < ?').run(Date.now() - 3 * 86_400_000); } catch { /* ignore */ }
  }, 3600_000).unref();
  run();
}
