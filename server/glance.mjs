// Compact data for the Android widgets.
//
// The native clients don't run the sync engine: they fetch one snapshot of
// "around now" and work out the current and next event themselves, so the
// widget stays right between refreshes. The snapshot also carries the signal
// settings and every reminder moment, which the devices schedule as alarms.

import { applyChanges, parseLeads, parseReminders } from './db.mjs';

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

export function getGlance(db, userId, now = Date.now()) {
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
        subjectId: s.subjectId ?? '',
        title: s.title || subjects.get(s.subjectId)?.name || 'Focus session',
        color: s.color || subjects.get(s.subjectId)?.color || null,
        start: s.start,
      }
    : null;

  return { now, session, events, todos, signals: normalizeSignals(settings.signals) };
}

/** Tick a task off (or reopen it) from a widget. */
export function setTodoDone(db, userId, id, done) {
  const row = db.prepare('SELECT id FROM todos WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return false;
  const now = Date.now();
  applyChanges(db, userId, {
    todos: [{ id, completed: done, completedAt: done ? new Date(now).toISOString() : null, updatedAt: now }],
  });
  return true;
}
