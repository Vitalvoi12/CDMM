// Compact data for the Android widgets and the Wear OS watch, plus pairing a
// watch to an account by a short code.
//
// The native clients don't run the sync engine: they fetch one snapshot of
// "around now" and work out the current and next event themselves, so the
// widget stays right between refreshes. The snapshot also carries the signal
// settings and every reminder moment, which the devices schedule as alarms.

import { randomBytes, randomInt } from 'node:crypto';
import { applyChanges, parseLeads, parseReminders } from './db.mjs';
import { createSessionToken } from './auth.mjs';

/** Events overlapping [now - BEFORE, now + AHEAD] go into the snapshot. */
const BEFORE_MS = 12 * 3600_000;
const AHEAD_MS = 3 * 86_400_000;
const MAX_TODOS = 30;

export const SIGNAL_KINDS = ['reminder', 'start', 'end', 'todo'];
export const SIGNAL_MODES = ['off', 'vibrate', 'sound', 'both'];
export const SIGNAL_PATTERNS = ['short', 'long', 'double', 'triple'];

/** What a device does when no one has chosen yet. Mirrors src/services/signals.ts. */
export const DEFAULT_SIGNALS = {
  phone: { reminder: 'both', start: 'off', end: 'off', todo: 'both', pattern: 'double' },
  watch: { reminder: 'vibrate', start: 'vibrate', end: 'vibrate', todo: 'vibrate', pattern: 'double' },
};

function deviceSignals(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of SIGNAL_KINDS) out[k] = SIGNAL_MODES.includes(src[k]) ? src[k] : fallback[k];
  out.pattern = SIGNAL_PATTERNS.includes(src.pattern) ? src.pattern : fallback.pattern;
  return out;
}

export function normalizeSignals(raw) {
  return {
    phone: deviceSignals(raw?.phone, DEFAULT_SIGNALS.phone),
    watch: deviceSignals(raw?.watch, DEFAULT_SIGNALS.watch),
  };
}

function readSettings(db, userId) {
  const row = db.prepare('SELECT data FROM settings WHERE user_id = ?').get(userId);
  try {
    return row ? JSON.parse(row.data) || {} : {};
  } catch {
    return {};
  }
}

/** Open tasks: overdue and dated first (soonest due), then important/urgent. */
function rankTodos(rows) {
  const score = (t) => (t.important ? 0 : 1) + (t.urgent ? 0 : 2);
  return rows.sort((a, b) => {
    const da = a.due_date ? Date.parse(a.due_date) : Infinity;
    const dbb = b.due_date ? Date.parse(b.due_date) : Infinity;
    if (da !== dbb) return da - dbb;
    if (score(a) !== score(b)) return score(a) - score(b);
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

export function getGlance(db, userId, now = Date.now(), day, timeZone) {
  let dateFormat;
  try { dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: timeZone || 'UTC', dateStyle: 'short' }); }
  catch { dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', dateStyle: 'short' }); }
  const dateOf = (value) => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '';
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) day = dateFormat.format(now);
  const settings = readSettings(db, userId);
  const subjects = new Map(
    db.prepare('SELECT id, name, color FROM subjects WHERE user_id = ?').all(userId).map((s) => [s.id, s])
  );
  const from = new Date(now - BEFORE_MS).toISOString();
  const to = new Date(now + AHEAD_MS).toISOString();
  // ISO strings in UTC compare correctly as text.
  const events = db
    .prepare('SELECT * FROM events WHERE user_id = ? AND end > ? AND start < ? ORDER BY start')
    .all(userId, from, to)
    .map((e) => {
      const subject = subjects.get(e.subject_id);
      const leads = typeof e.notify_before === 'number' && e.notify_before >= 0
        ? [...new Set([e.notify_before, ...(parseLeads(e.notify_extra) || [])])]
        : [];
      return {
        id: e.id,
        subjectId: e.subject_id,
        title: e.title || subject?.name || 'Event',
        subject: subject?.name ?? null,
        color: subject?.color || e.color || null,
        kind: e.kind === 'plan' ? 'plan' : 'real',
        start: e.start,
        end: e.end,
        leads,
      };
    });

  const todos = rankTodos(
    db.prepare('SELECT * FROM todos WHERE user_id = ? AND completed = 0').all(userId)
  )
    .slice(0, MAX_TODOS)
    .map((t) => ({
      id: t.id,
      title: t.title || 'Task',
      due: t.due_date || null,
      dueHasTime: t.due_has_time === 1,
      important: t.important === 1,
      urgent: t.urgent === 1,
      reminders: (parseReminders(t.reminders) || [])
        .map((r) => r.at)
        .filter((at) => Date.parse(at) > now - BEFORE_MS),
    }));

  const s = settings.activeSession;
  const session = s && typeof s.start === 'string'
    ? {
        id: s.id,
        subjectId: s.subjectId ?? '',
        title: s.title || subjects.get(s.subjectId)?.name || 'Focus session',
        color: s.color || subjects.get(s.subjectId)?.color || null,
        start: s.start,
      }
    : null;

  const recent = db.prepare('SELECT subject_id, MAX(start) AS last FROM events WHERE user_id = ? GROUP BY subject_id').all(userId);
  const lastUsed = new Map(recent.map((e) => [e.subject_id, e.last]));
  const focusSubjects = [...subjects.values()].sort((a, b) =>
    String(lastUsed.get(b.id) || '').localeCompare(String(lastUsed.get(a.id) || '')) || a.name.localeCompare(b.name)
  );
  const taskPlans = db.prepare("SELECT task_id, start FROM events WHERE user_id = ? AND kind = 'plan' AND task_id IS NOT NULL").all(userId);
  const planned = new Set(taskPlans.map(event => event.task_id));
  const linked = new Set(taskPlans.filter(event => dateOf(event.start) === day).map(event => event.task_id));
  const dayTasks = db.prepare(
    'SELECT * FROM todos WHERE user_id = ? AND (scheduled_date = ? OR scheduled_date IS NULL) ORDER BY created_at, rowid'
  ).all(userId, day)
    .filter(task => task.scheduled_date === day || (!task.scheduled_date && (planned.has(task.id) ? linked.has(task.id) : dateOf(task.due_date) === day)))
    .map(task => ({
      id: task.id, text: task.title, subjectId: task.subject_id || '',
      done: task.completed === 1, progress: task.progress, estMinutes: task.est_minutes,
    }));
  return { now, focusApiVersion: 1, session, sessionAt: Number(settings.activeSessionAt) || 0,
    subjects: focusSubjects, events, todos, taskDate: day, dayTasks,
    signals: normalizeSignals(settings.signals) };
}

/** Tick a task off (or reopen it) from a widget or the watch. */
export function setTodoDone(db, userId, id, done, now = Date.now()) {
  const row = db.prepare('SELECT completed, updated_at FROM todos WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return false;
  if (Boolean(row.completed) === done) return true;
  applyChanges(db, userId, {
    todos: [{ id, completed: done, completedAt: done ? new Date(now).toISOString() : null, updatedAt: Math.max(now, row.updated_at + 1) }],
  });
  return true;
}

// ---- watch pairing ---------------------------------------------------------
//
// The watch asks for a code and shows it; the user types it into Settings on
// any signed-in device; the watch, polling with its secret pair id, then
// receives a session token of its own. Nothing is typed on the watch.

const PAIR_TTL_MS = 10 * 60_000;
/** pairId -> { code, expires, userId?, token?, username? } */
const pairs = new Map();

function sweep(now = Date.now()) {
  for (const [id, p] of pairs) if (p.expires < now) pairs.delete(id);
}

export function startPairing() {
  sweep();
  let code;
  do code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  while ([...pairs.values()].some((p) => p.code === code));
  const pairId = randomBytes(24).toString('base64url');
  pairs.set(pairId, { code, expires: Date.now() + PAIR_TTL_MS });
  return { pairId, code, expiresIn: PAIR_TTL_MS / 1000 };
}

export function confirmPairing(db, userId, username, code) {
  sweep();
  for (const p of pairs.values()) {
    if (p.code === code && !p.token) {
      p.token = createSessionToken(db, userId);
      p.username = username;
      return true;
    }
  }
  return false;
}

/** 'pending' | 'expired' | { token, username } (handed out once). */
export function pollPairing(pairId) {
  sweep();
  const p = pairs.get(pairId);
  if (!p) return 'expired';
  if (!p.token) return 'pending';
  pairs.delete(pairId);
  return { token: p.token, username: p.username };
}
