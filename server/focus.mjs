// Watch commands are serialized with the sync state and remembered across retries.
import { applyChanges } from './db.mjs';
import { getGlance, setTodoDone } from './glance.mjs';

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const validId = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s);

export function focusCommand(db, userId, body, now = Date.now(), { nested = false } = {}) {
  if (!body || !validId(body.commandId) || !validId(body.sessionId)) fail(400, 'Invalid command');
  if (!['start', 'finish', 'rate', 'task'].includes(body.action)) fail(400, 'Unknown action');
  if (!nested) db.exec('BEGIN IMMEDIATE');
  try {
    const seen = db.prepare('SELECT 1 FROM focus_commands WHERE user_id = ? AND command_id = ?').get(userId, body.commandId);
    if (!seen) {
      const row = db.prepare('SELECT data FROM settings WHERE user_id = ?').get(userId);
      const settings = row ? JSON.parse(row.data) : {};
      const active = settings.activeSession;
      const stamp = Math.max(now, (Number(settings.activeSessionAt) || 0) + 1);
      const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(body.sessionId, userId);
      const tomb = db.prepare("SELECT 1 FROM tombstones WHERE entity = 'events' AND key = ? AND user_id = ?").get(body.sessionId, userId);
      if (body.action === 'task') {
        if (typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day) || typeof body.completed !== 'boolean') fail(400, 'Invalid task');
        if (!setTodoDone(db, userId, body.sessionId, body.completed, now)) fail(404, 'Task no longer exists');
      } else if (body.action === 'start') {
        if (active || Number(body.expectedSessionAt) !== (Number(settings.activeSessionAt) || 0)) fail(409, 'Session changed on another device');
        if (existing || tomb || db.prepare('SELECT 1 FROM events WHERE id = ?').get(body.sessionId)) fail(409, 'Session already saved');
        const subject = db.prepare('SELECT id, name, color FROM subjects WHERE id = ? AND user_id = ?').get(body.subjectId, userId);
        if (!subject) fail(404, 'Subject no longer exists');
        const start = Date.parse(body.at);
        if (!Number.isFinite(start) || start > now + 60_000 || start < now - 7 * 86400_000) fail(400, 'Invalid start time');
        applyChanges(db, userId, { settings: { data: {
          ...settings, activeSession: { id: body.sessionId, subjectId: subject.id,
            start: new Date(Math.min(start, now)).toISOString(), updatedAt: stamp }, activeSessionAt: stamp,
        }, updatedAt: stamp } });
      } else if (body.action === 'finish') {
        // A retry or another device may already have saved this same session.
        if (!existing && !tomb) {
          if (active?.id !== body.sessionId) fail(409, 'Session changed on another device');
          if (db.prepare('SELECT 1 FROM events WHERE id = ? AND user_id != ?').get(body.sessionId, userId)) fail(409, 'Session id unavailable');
          const end = Date.parse(body.at);
          const start = Date.parse(active.start);
          if (!Number.isFinite(end) || !Number.isFinite(start) || end < start || end > now + 60_000) fail(400, 'Invalid finish time');
          const subject = db.prepare('SELECT name FROM subjects WHERE id = ? AND user_id = ?').get(active.subjectId, userId);
          applyChanges(db, userId, { events: [{ id: active.id, uid: `evt-${active.id}@cdmm`,
            subjectId: active.subjectId || '', title: active.title || subject?.name || 'Focus session',
            color: active.color, start: active.start, end: new Date(Math.max(start, Math.min(end, now))).toISOString(),
            kind: 'real', countInStats: active.countInStats !== false, createdAt: new Date(now).toISOString(), updatedAt: stamp,
          }] });
        }
        // Never clear a newer session that started on another device.
        if (active?.id === body.sessionId) applyChanges(db, userId, { settings: { data: {
          ...settings, activeSession: null, activeSessionAt: stamp,
        }, updatedAt: stamp } });
      } else {
        if (![1, 2, 3].includes(body.focus)) fail(400, 'Invalid focus rating');
        if (!existing || existing.kind !== 'real') fail(404, 'Session no longer exists');
        applyChanges(db, userId, { events: [{ id: body.sessionId, focus: body.focus,
          updatedAt: Math.max(stamp, existing.updated_at + 1) }] });
      }
      db.prepare('INSERT INTO focus_commands (user_id, command_id, created_at) VALUES (?, ?, ?)').run(userId, body.commandId, now);
    }
    if (!nested) db.exec('COMMIT');
  } catch (e) { if (!nested) db.exec('ROLLBACK'); throw e; }
  return getGlance(db, userId, now, body.day, body.timeZone);
}
