import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, getState } from './db.mjs';
import { assistantConfirmation, executeAssistantCommand, getAssistantHistory, interpretAssistantCommand } from './assistant.mjs';

test('requests one bounded OpenRouter tool call using the phone time zone', async () => {
  const result = await interpretAssistantCommand({ text: 'Что завтра?', timeZone: 'Asia/Tokyo' }, {
    key: 'test',
    history: [{ text: 'Создай предмет математика', action: 'create_subject', args: { name: 'математика' } }],
    now: new Date('2026-11-27T23:00:00Z'),
    request: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(body.model, 'deepseek/deepseek-v4-flash');
      assert.equal(body.provider.require_parameters, true);
      assert.equal(JSON.parse(body.messages[1].content).recentCommands[0].args.name, 'математика');
      assert.equal(JSON.parse(body.messages[1].content).localTime, '2026-11-28 08:00');
      return Response.json({ choices: [{ message: { tool_calls: [{
        function: { name: 'list_schedule', arguments: '{"date":"2026-11-29"}' },
      }] } }] });
    },
  });
  assert.equal(result.action, 'list_schedule');
});

test('assistant writes syncable changes and replays a request only once', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cdmm-assistant-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('alice', 'alice', 'unused', 'unused', Date.now());
  const run = (id, action, args) => executeAssistantCommand(db, 'alice', { action, args }, 'Europe/Moscow', id, id);
  assert.deepEqual(run('subjects-empty', 'list_subjects', {}).context.shownSubjects, []);
  run('subject', 'create_subject', { name: 'Математика' });
  assert.deepEqual(run('subjects', 'list_subjects', {}).context.shownSubjects, ['Математика']);
  run('other-subject', 'create_subject', { name: 'Физика' });
  run('show-subjects', 'list_subjects', {});
  const last = assistantConfirmation('Удали последний из них');
  const confirmation = run('delete-last', last.action, last.args);
  assert.equal(confirmation.pendingDeletion.entity, 'subjects');
  run('confirm-last', 'confirm_delete', {});
  assert.deepEqual(getState(db, 'alice').subjects.map(({ name }) => name), ['Математика']);
  run('goal', 'update_subject', { name: 'Математика', weeklyGoalMinutes: '180' });
  assert.equal(getState(db, 'alice').subjects[0].weeklyGoalMinutes, 180);
  run('note', 'write_day_note', { date: '2026-11-29', mode: 'append', content: 'Проверка' });
  assert.equal(run('read-note', 'read_day_note', { date: '2026-11-29' }).message, 'Проверка');
  assert.equal(run('open-todo', 'open_screen', { screen: 'todo' }).clientRoute, '/todo');
  run('create-series', 'create_event', { title: 'Повтор', start: '2026-11-27T10:00',
    end: '2026-11-27T11:00', repeat: 'daily', until: '2026-11-29' });
  const series = getState(db, 'alice').events;
  assert.equal(series.length, 3);
  assert.equal(new Set(series.map((event) => event.recurrenceId)).size, 1);
  run('resize-series', 'update_event', { title: 'Повтор', date: '2026-11-28',
    end: '2026-11-28T11:30', scope: 'following' });
  assert.deepEqual(getState(db, 'alice').events.map((event) => event.end.slice(11, 16)).sort(),
    ['08:00', '08:30', '08:30']);
  run('delete-series', 'delete_event', { title: 'Повтор', scope: 'series' });
  run('confirm-series', 'confirm_delete', {});
  assert.deepEqual(getState(db, 'alice').events, []);
  const args = { title: 'Решить задачу', scheduledDate: '2026-11-29', dueDate: '2026-11-30' };
  assert.deepEqual(run('todo', 'create_todo', args), run('todo', 'create_todo', args));
  assert.equal(getState(db, 'alice').todos.length, 1);
  assert.equal(getAssistantHistory(db, 'alice', 'Europe/Moscow').at(-1).args.title, args.title);
  assert.deepEqual(getAssistantHistory(db, 'bob', 'Europe/Moscow'), []);
  assert.throws(() => executeAssistantCommand(db, 'alice', null, 'Europe/Moscow', 'todo', 'different'),
    { status: 409 });
  const original = getState(db, 'alice').todos[0];
  run('edit', 'update_todo', { title: args.title, estMinutes: '45' });
  const edited = getState(db, 'alice').todos;
  assert.equal(edited.length, 1);
  assert.equal(edited[0].id, original.id);
  assert.equal(edited[0].scheduledDate, original.scheduledDate);
  assert.equal(edited[0].estMinutes, 45);
  run('complete', 'complete_todo', { title: args.title });
  assert.ok(getState(db, 'alice').todos[0].completedAt);
  assert.equal(getState(db, 'alice').todos[0].dueDate, '2026-11-30T15:00:00.000Z');
  run('a', 'create_event', { title: 'Математика', start: '2026-11-29T16:00', end: '2026-11-29T17:00' });
  run('b', 'create_event', { title: 'Английский', start: '2026-11-29T17:00', end: '2026-11-29T17:30' });
  run('swap', 'swap_events', { date: '2026-11-29', first: '1', second: '2' });
  assert.equal(getState(db, 'alice').events.find((event) => event.title === 'Математика').start, '2026-11-29T13:30:00.000Z');
  const deleteRef = assistantConfirmation('Удали это событие.');
  run('schedule-several', 'list_schedule', { date: '2026-11-29' });
  const ambiguous = run('delete-several', deleteRef.action, deleteRef.args);
  assert.equal(ambiguous.pendingDeletion, undefined);
  run('single', 'create_event', { title: 'Физика', start: '2026-11-30T10:00', end: '2026-11-30T11:00' });
  run('schedule-one', 'list_schedule', { date: '2026-11-30' });
  const pending = run('delete-one', deleteRef.action, deleteRef.args);
  assert.equal(getState(db, 'alice').events.find((event) => event.id === pending.pendingDeletion.references[0].id).title, 'Физика');
  run('confirm', 'confirm_delete', {});
  assert.equal(getState(db, 'alice').events.length, 2);
  const deleteTodos = assistantConfirmation('Удали их всех.');
  const listed = run('list-todos', 'list_todos', { quadrant: 'neither' });
  assert.equal(listed.todoReferences.length, 1);
  const pendingTodos = run('delete-todos', deleteTodos.action, deleteTodos.args);
  assert.equal(pendingTodos.pendingDeletion.references.length, 1);
  assert.equal(getState(db, 'alice').todos.length, 1);
  run('confirm-todos', 'confirm_delete', {});
  assert.equal(getState(db, 'alice').todos.length, 0);
  run('duplicate-a', 'create_todo', { title: 'Заметки', estMinutes: '30' });
  run('duplicate-b', 'create_todo', { title: 'Заметки', estMinutes: '60' });
  const ambiguousTodo = run('ambiguous-todo', 'delete_todo', { title: 'Заметки' });
  assert.equal(ambiguousTodo.todoReferences.length, 2);
  assert.equal(ambiguousTodo.pendingDeletion, undefined);
  const ordinal = assistantConfirmation('Удали первое');
  const chosen = run('delete-first-todo', ordinal.action, ordinal.args);
  assert.equal(chosen.pendingDeletion.references[0].id, ambiguousTodo.todoReferences[0].id);
  run('confirm-first-todo', 'confirm_delete', {});
  const remaining = getState(db, 'alice').todos;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, ambiguousTodo.todoReferences[1].id);
  assert.equal(getState(db, 'alice').events.length, 2);
});

test('clarification cannot ask for a deletion confirmation', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cdmm-assistant-clarify-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('alice', 'alice', 'unused', 'unused', Date.now());
  const result = executeAssistantCommand(db, 'alice', {
    action: 'clarify', args: { detail: 'Вы подтверждаете?' },
  }, 'Europe/Moscow', 'request', 'Удали событие');
  assert.equal(result.message, 'Не удалось разобрать команду. Укажи действие и название задачи, события или предмета.');
  assert.equal(result.pendingDeletion, undefined);
});
