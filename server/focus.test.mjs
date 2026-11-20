import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { openDb, applyChanges, getChanges } from './db.mjs';
import { focusCommand } from './focus.mjs';
import { getGlance } from './glance.mjs';
import { handleApi } from './api.mjs';
import { createSessionToken } from './auth.mjs';

const now = Date.now();
const iso = (offset = 0) => new Date(now + offset).toISOString();
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cdmm-focus-'));
  const db = openDb(dir);
  for (const id of ['alice', 'bob']) db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(id, id, 'unused', 'unused', now);
  applyChanges(db, 'alice', { subjects: [{ id: 'math', name: 'Математика', color: '#ff8866', updatedAt: now }] });
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
const start = (extra = {}) => ({ action: 'start', commandId: 'start-1', sessionId: 'session-1', subjectId: 'math', expectedSessionAt: 0, at: iso(-600_000), ...extra });
const finish = (extra = {}) => ({ action: 'finish', commandId: 'finish-1', sessionId: 'session-1', at: iso(), ...extra });
const rate = (extra = {}) => ({ action: 'rate', commandId: 'rate-1', sessionId: 'session-1', focus: 3, ...extra });

test('offline start, finish and rating use captured times and appear in web sync', (t) => {
  const db = fixture(t);
  let view = focusCommand(db, 'alice', start(), now);
  assert.equal(view.session.id, 'session-1');
  assert.equal(view.session.title, 'Математика');
  view = focusCommand(db, 'alice', finish(), now + 120_000);
  assert.equal(view.session, null);
  focusCommand(db, 'alice', rate(), now + 120_001);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get('session-1');
  assert.equal(event.start, iso(-600_000));
  assert.equal(event.end, iso());
  assert.equal(event.focus, 3);
  assert.equal(event.kind, 'real');
  const changes = getChanges(db, 'alice', 0).changes;
  assert.ok(changes.some((c) => c.entity === 'events' && c.payload.focus === 3));
  assert.equal(changes.filter((c) => c.entity === 'settings').at(-1).payload.data.activeSession, null);
});

test('lost responses and a second finish produce exactly one event', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  focusCommand(db, 'alice', start(), now + 1000);
  focusCommand(db, 'alice', finish(), now + 2000);
  focusCommand(db, 'alice', finish(), now + 3000);
  focusCommand(db, 'alice', finish({ commandId: 'finish-other-device', at: iso(4000) }), now + 4000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
  assert.equal(db.prepare('SELECT end FROM events').get().end, iso());
  // A delayed retry of Start cannot bring a completed session back.
  assert.equal(focusCommand(db, 'alice', start(), now + 5000).session, null);
});

test('stale offline start cannot replace another device session, including after it ended', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  assert.throws(() => focusCommand(db, 'alice', start({ commandId: 'stale', sessionId: 'stale' }), now), { status: 409 });
  focusCommand(db, 'alice', finish(), now);
  assert.throws(() => focusCommand(db, 'alice', start({ commandId: 'stale', sessionId: 'stale' }), now), { status: 409 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM focus_commands WHERE command_id = 'stale'").get().n, 0);
});

test('late finish leaves a newer active session intact', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  const ended = focusCommand(db, 'alice', finish(), now + 1);
  focusCommand(db, 'alice', start({ commandId: 'start-2', sessionId: 'session-2', expectedSessionAt: ended.sessionAt }), now + 2);
  assert.equal(focusCommand(db, 'alice', finish({ commandId: 'late-finish' }), now + 3).session.id, 'session-2');
});

test('finished session is not resurrected by stale settings sync', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  const stale = JSON.parse(db.prepare('SELECT data FROM settings WHERE user_id = ?').get('alice').data);
  focusCommand(db, 'alice', finish(), now + 1);
  applyChanges(db, 'alice', { settings: { data: { ...stale, theme: 'light' }, updatedAt: now + 2 } });
  assert.equal(getGlance(db, 'alice').session, null);
});

test('existing plan remains intact when actual focus is recorded', (t) => {
  const db = fixture(t);
  applyChanges(db, 'alice', { events: [{ id: 'plan', subjectId: 'math', title: 'План', start: iso(-900_000), end: iso(900_000), kind: 'plan', updatedAt: now }] });
  focusCommand(db, 'alice', start(), now);
  focusCommand(db, 'alice', finish(), now);
  assert.equal(db.prepare("SELECT kind FROM events WHERE id = 'plan'").get().kind, 'plan');
  assert.equal(getGlance(db, 'alice').events.find((e) => e.id === 'plan').subjectId, 'math');
});

test('another account cannot start a foreign subject, finish or rate a session', (t) => {
  const db = fixture(t);
  assert.throws(() => focusCommand(db, 'bob', start(), now), { status: 404 });
  focusCommand(db, 'alice', start(), now);
  assert.throws(() => focusCommand(db, 'bob', finish(), now), { status: 409 });
  focusCommand(db, 'alice', finish(), now);
  assert.throws(() => focusCommand(db, 'bob', rate(), now), { status: 404 });
  assert.equal(db.prepare('SELECT focus FROM events').get().focus, null);
});

test('invalid commands leave no partial changes and a later valid finish works', (t) => {
  const db = fixture(t);
  assert.throws(() => focusCommand(db, 'alice', start({ at: 'bad' }), now), { status: 400 });
  assert.throws(() => focusCommand(db, 'alice', start({ at: iso(120_000) }), now), { status: 400 });
  focusCommand(db, 'alice', start(), now);
  assert.throws(() => focusCommand(db, 'alice', finish({ at: iso(-900_000) }), now), { status: 400 });
  assert.equal(getGlance(db, 'alice').session.id, 'session-1');
  focusCommand(db, 'alice', finish(), now);
  assert.throws(() => focusCommand(db, 'alice', rate({ focus: 4 }), now), { status: 400 });
});

test('finish from web-created custom session preserves excluded statistics and color', (t) => {
  const db = fixture(t);
  applyChanges(db, 'alice', { settings: { data: { activeSession: { id: 'session-1', subjectId: '', title: 'Чтение', color: '#abcdef', start: iso(-1000), countInStats: false }, activeSessionAt: now }, updatedAt: now } });
  focusCommand(db, 'alice', finish(), now);
  const event = db.prepare('SELECT * FROM events').get();
  assert.equal(event.title, 'Чтение');
  assert.equal(event.color, '#abcdef');
  assert.equal(event.count_in_stats, 0);
});

test('today checklist uses the watch date and preserves other tasks during updates', (t) => {
  const db = fixture(t);
  const day = '2026-11-07'; // Watch may already be on the next day.
  applyChanges(db, 'alice', { dayTasks: [{ id: day, tasks: [
    { id: 'task-1', text: 'Задача 1', done: false, subjectId: 'math' },
    { id: 'task-2', text: 'Задача 2', done: false, subjectId: '' },
  ], updatedAt: now }] });
  const cmd = { action: 'task', commandId: 'task-done', sessionId: 'task-1', day, completed: true };
  const view = focusCommand(db, 'alice', cmd, now);
  assert.equal(view.taskDate, day);
  assert.equal(view.dayTasks[0].done, true);
  assert.equal(view.dayTasks[1].done, false);
  assert.equal(focusCommand(db, 'alice', cmd, now + 1).dayTasks[0].done, true);
  assert.throws(() => focusCommand(db, 'bob', cmd, now), { status: 404 });
});

test('deleted finished event stays deleted when an old finish is retried', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  focusCommand(db, 'alice', finish(), now);
  applyChanges(db, 'alice', { tombstones: [{ entity: 'events', key: 'session-1', updatedAt: now + 10 }] });
  focusCommand(db, 'alice', finish({ commandId: 'retry-after-delete' }), now + 20);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 0);
});

test('a database failure rolls back the event, settings and receipt together', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  const before = getChanges(db, 'alice', 0).changes.length;
  db.exec("CREATE TRIGGER simulate_disk_failure BEFORE INSERT ON focus_commands WHEN NEW.command_id = 'finish-1' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
  assert.throws(() => focusCommand(db, 'alice', finish(), now), /simulated failure/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 0);
  assert.equal(getGlance(db, 'alice').session.id, 'session-1');
  assert.equal(getChanges(db, 'alice', 0).changes.length, before);
  db.exec('DROP TRIGGER simulate_disk_failure');
  assert.equal(focusCommand(db, 'alice', finish(), now).session, null);
});

test('a replayed rating does not overwrite a newer rating', (t) => {
  const db = fixture(t);
  focusCommand(db, 'alice', start(), now);
  focusCommand(db, 'alice', finish(), now);
  focusCommand(db, 'alice', rate(), now);
  focusCommand(db, 'alice', rate({ commandId: 'second-rating', focus: 2 }), now + 1);
  focusCommand(db, 'alice', rate(), now + 2);
  assert.equal(db.prepare('SELECT focus FROM events').get().focus, 2);
});

test('HTTP endpoint enforces authentication and returns fresh snapshots', async (t) => {
  const db = fixture(t);
  const token = createSessionToken(db, 'alice');
  async function request(body, auth) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.url = '/api/focus'; req.method = 'POST'; req.headers = auth ? { authorization: `Bearer ${auth}` } : {};
    const result = {};
    const res = { writeHead(status) { result.status = status; }, end(text) { result.body = JSON.parse(text); } };
    await handleApi(db, req, res, '/api/focus');
    return result;
  }
  assert.equal((await request(start())).status, 401);
  const result = await request(start(), token);
  assert.equal(result.status, 200);
  assert.equal(result.body.focusApiVersion, 1);
  assert.equal(result.body.session.id, 'session-1');
  assert.equal((await request({ ...finish(), at: 'bad' }, token)).status, 400);
});
