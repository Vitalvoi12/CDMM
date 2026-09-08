import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
export const MIN_PASSWORD_LEN = 8;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function verifyPassword(password, saltHex, hashHex) {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSessionToken(db, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash(token), userId, Date.now() + SESSION_TTL_MS
  );
  return token;
}

export function lookupSession(db, token) {
  if (!token) return null;
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(tokenHash(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return null;
  }
  return row.user_id;
}

export function deleteSession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function touchSession(db, token) {
  if (!token) return;
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
    Date.now() + SESSION_TTL_MS, tokenHash(token)
  );
}

export function cleanupExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

export function bearerToken(req) {
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/** Simple in-memory per-IP rate limiter. */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || rec.reset < now) {
      hits.set(ip, { n: 1, reset: now + windowMs });
      return true;
    }
    rec.n++;
    return rec.n <= max;
  };
}
