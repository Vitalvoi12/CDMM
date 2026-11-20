import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyChanges, getChanges, getState, openDb } from './db.mjs';
import { getGlance } from './glance.mjs';
import { focusCommand } from './focus.mjs';

const day = '2026-11-20';
const next = '2026-11-21';
const now = Date.parse(day + 'T12:00:00Z');

function account(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cdmm-checklist-'));
  let db = openDb(dir);
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('user', 'user', 'hash', 'salt', now);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, reopen() { db.close(); db = openDb(dir); return db; } };
}

test('legacy checklists migrate with their IDs and progress and stay deleted after a restart', (t) => {
  const fixture = account(t);
  fixture.db.prepare('INSERT INTO day_tasks VALUES (?, ?, ?, ?)').run(day, 'user', JSON.stringify([
    { id: 'legacy', text: 'Homework', done: false, subjectId: 'math', estMinutes: 45, progress: 35 },
  ]), now);
  const db = fixture.reopen();
  const [task] = getState(db, 'user').todos;
  assert.equal(task.id, 'legacy');
  assert.equal(task.important, false);
  assert.equal(task.urgent, false);
  assert.equal(task.subjectId, 'math');
  assert.equal(task.scheduledDate, day);
  assert.equal(task.dueDate, null);
  assert.equal(task.estMinutes, 45);
  assert.equal(task.progress, 35);
  assert.ok(getChanges(db, 'user', 0).changes.some(change => change.entity === 'todos' && change.key === task.id));
  applyChanges(db, 'user', { tombstones: [{ entity: 'todos', key: task.id, updatedAt: now + 1 }] });
  assert.equal(getState(fixture.reopen(), 'user').todos.length, 0);
});

test('dated and linked tasks appear once on the plan day and watch completion updates the Todo', (t) => {
  const { db } = account(t);
  applyChanges(db, 'user', {
    todos: [
      { id: 'dated', title: 'Read', subjectId: 'math', scheduledDate: day, dueDate: next + 'T18:00:00Z', updatedAt: now },
      { id: 'linked', title: 'Write', subjectId: 'math', dueDate: day + 'T18:00:00Z', updatedAt: now },
    ],
    events: [{ id: 'plan', kind: 'plan', taskId: 'linked', start: day + 'T22:00:00Z', end: day + 'T23:00:00Z', updatedAt: now }],
  });
  assert.deepEqual(getGlance(db, 'user', now, day, 'Europe/Moscow').dayTasks.map(task => task.id), ['dated']);
  assert.deepEqual(getGlance(db, 'user', now, next, 'Europe/Moscow').dayTasks.map(task => task.id), ['linked']);
  const view = focusCommand(db, 'user', { action: 'task', sessionId: 'linked', commandId: 'done', day: next, timeZone: 'Europe/Moscow', completed: true }, now + 1);
  assert.equal(view.dayTasks[0].done, true);
  const linked = getState(db, 'user').todos.find(task => task.id === 'linked');
  assert.equal(linked.completed, true);
  assert.equal(linked.progress, 100);
  applyChanges(db, 'user', { todos: [{ id: 'dated', scheduledDate: next, updatedAt: now + 2 }] });
  assert.deepEqual(getGlance(db, 'user', now, day, 'Europe/Moscow').dayTasks, []);
  assert.equal(getGlance(db, 'user', now, next, 'Europe/Moscow').dayTasks.length, 2);
});

test('moving a due task to a non-urgent quadrant preserves the deadline and syncs the choice', (t) => {
  const { db } = account(t);
  const dueDate = day + 'T18:00:00Z';
  applyChanges(db, 'user', { todos: [{ id: 'due', title: 'Read', urgent: true, dueDate, updatedAt: now }] });
  applyChanges(db, 'user', { todos: [{ id: 'due', urgent: false, autoUrgencyDismissed: true, updatedAt: now + 1 }] });
  const task = getState(db, 'user').todos[0];
  assert.equal(task.dueDate, dueDate);
  assert.equal(task.urgent, false);
  assert.equal(task.autoUrgencyDismissed, true);
  const change = getChanges(db, 'user', 0).changes.filter(change => change.entity === 'todos').at(-1);
  assert.equal(change.payload.autoUrgencyDismissed, true);
});
