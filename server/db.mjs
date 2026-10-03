import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Entity names as they travel on the wire (the client mirrors them).
const ENTITIES = ['subjects', 'events', 'todos', 'eventEdits'];

/** Wire entity name -> SQL table. Only the plan-stability log differs. */
const TABLE = {
  subjects: 'subjects',
  events: 'events',
  todos: 'todos',
  eventEdits: 'event_edits',
};

export function openDb(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'cdmm.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      icon TEXT,
      progress REAL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uid TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT,
      start TEXT NOT NULL DEFAULT '',
      end TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'real',
      recurrence_id TEXT,
      count_in_stats INTEGER NOT NULL DEFAULT 1,
      checklist TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
    CREATE TABLE IF NOT EXISTS event_edits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL DEFAULT 0,
      from_start TEXT NOT NULL DEFAULT '',
      from_end TEXT NOT NULL DEFAULT '',
      to_start TEXT NOT NULL DEFAULT '',
      to_end TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'real',
      count_in_stats INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_event_edits_user ON event_edits(user_id);
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT,
      important INTEGER NOT NULL DEFAULT 0,
      urgent INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      est_minutes INTEGER,
      subject_id TEXT,
      completed_at TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
    CREATE TABLE IF NOT EXISTS tombstones (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity TEXT NOT NULL,
      key TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, entity, key)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS change_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity TEXT NOT NULL,
      key TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      payload TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_changelog_user_seq ON change_log(user_id, seq);
  `);
  // Migration for DBs created before recurrence support: no-op when present.
  try {
    db.exec('ALTER TABLE events ADD COLUMN recurrence_id TEXT');
  } catch {
    // column already exists — ignore
  }
  // Migration for custom event colors.
  try {
    db.exec('ALTER TABLE events ADD COLUMN color TEXT');
  } catch {
    // column already exists — ignore
  }
  // Migration for the "count in stats" event flag (default: counted).
  try {
    db.exec('ALTER TABLE events ADD COLUMN count_in_stats INTEGER NOT NULL DEFAULT 1');
  } catch {
    // column already exists — ignore
  }
  // Migration for the todo estimated-duration field (NULL = not estimated).
  try {
    db.exec('ALTER TABLE todos ADD COLUMN est_minutes INTEGER');
  } catch {
    // column already exists — ignore
  }
  // Migration for per-event checklist tasks (JSON array, NULL = none).
  try {
    db.exec('ALTER TABLE events ADD COLUMN checklist TEXT');
  } catch {
    // column already exists — ignore
  }
  // Migration for the plan-stability log: the event's stats flag at the time
  // of the change, so excluded blocks can be filtered out later.
  try {
    db.exec('ALTER TABLE event_edits ADD COLUMN count_in_stats INTEGER NOT NULL DEFAULT 1');
  } catch {
    // column already exists — ignore
  }
  // Migration for the todo subject link (drives subject task statistics).
  try {
    db.exec('ALTER TABLE todos ADD COLUMN subject_id TEXT');
  } catch {
    // column already exists — ignore
  }
  // Migration for the todo completion timestamp (deadline statistics).
  try {
    db.exec('ALTER TABLE todos ADD COLUMN completed_at TEXT');
  } catch {
    // column already exists — ignore
  }
  return db;
}

export function newId() {
  return randomUUID();
}

function logChange(db, userId, entity, key, deleted, payload, at) {
  db.prepare(
    'INSERT INTO change_log (user_id, entity, key, deleted, payload, at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, entity, key, deleted ? 1 : 0, payload ? JSON.stringify(payload) : null, at);
}

export function userHasData(db, userId) {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM subjects WHERE user_id = ?) +
         (SELECT COUNT(*) FROM events WHERE user_id = ?) +
         (SELECT COUNT(*) FROM todos WHERE user_id = ?) AS n`
    )
    .get(userId, userId, userId);
  return (row?.n ?? 0) > 0;
}

export function getState(db, userId) {
  const settingsRow = db.prepare('SELECT data, updated_at FROM settings WHERE user_id = ?').get(userId);
  let settings = null;
  if (settingsRow) {
    let data = {};
    try {
      data = JSON.parse(settingsRow.data);
    } catch {
      data = {};
    }
    settings = { data, updatedAt: settingsRow.updated_at };
  }
  return {
    empty: !userHasData(db, userId),
    subjects: db.prepare('SELECT * FROM subjects WHERE user_id = ?').all(userId).map((r) => rowToPayload('subjects', r)),
    events: db.prepare('SELECT * FROM events WHERE user_id = ?').all(userId).map((r) => rowToPayload('events', r)),
    todos: db.prepare('SELECT * FROM todos WHERE user_id = ?').all(userId).map((r) => rowToPayload('todos', r)),
    eventEdits: db.prepare('SELECT * FROM event_edits WHERE user_id = ?').all(userId).map((r) => rowToPayload('eventEdits', r)),
    tombstones: db.prepare('SELECT entity, key FROM tombstones WHERE user_id = ?').all(userId),
    settings,
    cursor: db.prepare('SELECT COALESCE(MAX(seq), 0) AS c FROM change_log WHERE user_id = ?').get(userId).c,
  };
}

/** One-time bulk import for a fresh account. Throws {status} on conflict. */
export function importSnapshot(db, userId, data) {
  if (userHasData(db, userId)) {
    throw { status: 409, message: 'Account already has data' };
  }
  return applyChanges(db, userId, data || {});
}

function rowToPayload(entity, row) {
  if (entity === 'subjects') {
    return { id: row.id, name: row.name, color: row.color, icon: row.icon, progress: row.progress, updatedAt: row.updated_at };
  }
  if (entity === 'eventEdits') {
    return {
      id: row.id, eventId: row.event_id, at: row.at,
      fromStart: row.from_start, fromEnd: row.from_end,
      toStart: row.to_start, toEnd: row.to_end,
      title: row.title, subjectId: row.subject_id,
      kind: row.kind === 'plan' ? 'plan' : 'real',
      countInStats: row.count_in_stats === 0 ? false : true, updatedAt: row.updated_at,
    };
  }
  if (entity === 'events') {
    return { id: row.id, uid: row.uid, subjectId: row.subject_id, title: row.title, description: row.description, start: row.start, end: row.end, kind: row.kind, recurrenceId: row.recurrence_id || undefined, color: row.color || undefined, countInStats: row.count_in_stats === 0 ? false : true, checklist: parseChecklist(row.checklist), updatedAt: row.updated_at };
  }
  return {
    id: row.id, title: row.title, description: row.description,
    important: row.important === 1, urgent: row.urgent === 1,
    dueDate: row.due_date,
    estMinutes: row.est_minutes == null ? undefined : row.est_minutes,
    subjectId: row.subject_id || undefined,
    completedAt: row.completed_at || undefined,
    completed: row.completed === 1,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const COLS = {
  subjects: ['name', 'color', 'icon', 'progress'],
  events: ['uid', 'subject_id', 'title', 'description', 'start', 'end', 'kind', 'recurrence_id', 'color', 'count_in_stats', 'checklist'],
  todos: ['title', 'description', 'important', 'urgent', 'due_date', 'est_minutes', 'subject_id', 'completed_at', 'completed', 'created_at'],
  eventEdits: ['event_id', 'at', 'from_start', 'from_end', 'to_start', 'to_end', 'title', 'subject_id', 'kind', 'count_in_stats'],
};

const FROM_CLIENT = {
  name: 'name', color: 'color', icon: 'icon', progress: 'progress',
  uid: 'uid', subjectId: 'subject_id', title: 'title', description: 'description',
  start: 'start', end: 'end', kind: 'kind', recurrenceId: 'recurrence_id',
  countInStats: 'count_in_stats', checklist: 'checklist',
  important: 'important', urgent: 'urgent', dueDate: 'due_date', estMinutes: 'est_minutes',
  completedAt: 'completed_at', completed: 'completed',
  createdAt: 'created_at', updatedAt: 'updated_at',
  eventId: 'event_id', at: 'at',
  fromStart: 'from_start', fromEnd: 'from_end', toStart: 'to_start', toEnd: 'to_end',
};

/**
 * Checklist wire form is a JSON array; anything else (or an empty list)
 * reads back as "no tasks" so old records and cleared lists stay clean.
 */
function parseChecklist(value) {
  if (value == null || value === '') return undefined;
  try {
    const arr = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(arr)) return undefined;
    const items = arr
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({ id: String(t.id || ''), text: String(t.text ?? ''), done: t.done === true }))
      .filter((t) => t.id && t.text);
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Apply client dirty records with last-write-wins on updated_at.
 * `dirty` = { subjects?: [...], events?: [...], todos?: [...], tombstones?: [{entity,key}], settings?: {data, updatedAt} }
 * tombstone entries remove the record and log a deletion.
 */
export function applyChanges(db, userId, dirty) {
  const now = Date.now();

  const forced = [];

  const fullRow = (entity, id) => {
    const row = db.prepare(`SELECT * FROM ${TABLE[entity]} WHERE id = ? AND user_id = ?`).get(id, userId);
    return row ? { entity, key: id, deleted: false, payload: rowToPayload(entity, row) } : null;
  };

  const upsert = (entity, rec) => {
    if (!rec || typeof rec.id !== 'string' || !rec.id) return;
    const ts = Number(rec.updatedAt) > 0 ? Number(rec.updatedAt) : now;
    const table = TABLE[entity];
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(rec.id, userId);
    if (existing && existing.updated_at > ts) {
      // Server copy is newer — keep it and force it back to the sender,
      // otherwise the sender diverges permanently.
      const cur = fullRow(entity, rec.id);
      if (cur) forced.push(cur);
      return;
    }
    // Do not resurrect tombstoned records.
    const tomb = db.prepare('SELECT updated_at FROM tombstones WHERE user_id = ? AND entity = ? AND key = ?').get(userId, entity, rec.id);
    if (tomb && tomb.updated_at >= ts) return;

    // Partial records are accepted: absent keys inherit the existing row
    // (an explicit null still clears a nullable column).
    const prev = existing || {};
    const colVals = {};
    for (const col of COLS[entity]) {
      const clientKey = Object.keys(FROM_CLIENT).find((k) => FROM_CLIENT[k] === col);
      let v = clientKey && Object.prototype.hasOwnProperty.call(rec, clientKey) ? rec[clientKey] : prev[col];
      if (col === 'important' || col === 'urgent' || col === 'completed') {
        v = v ? 1 : 0;
      } else if (col === 'at') {
        // Epoch column of the plan-stability log: never store a string.
        v = Number(v) || 0;
      } else if (col === 'subject_id' && v === null) {
        // The subject link is optional and a client clears it by sending null.
        // Older databases created the column NOT NULL, so normalize instead of
        // failing the whole push over one nullable link.
        v = '';
      } else if (col === 'kind') {
        v = v === 'plan' ? 'plan' : 'real';
      } else if (col === 'count_in_stats') {
        if (v === undefined) v = prev[col] === undefined ? 1 : prev[col];
        else v = v ? 1 : 0;
      } else if (col === 'checklist') {
        // JSON array on the wire, TEXT in the column. Absent inherits the
        // stored value; an empty list (or explicit null) clears to NULL.
        if (v === undefined) v = prev[col] === undefined ? null : prev[col];
        else if (v === null) v = null;
        else if (Array.isArray(v)) v = v.length > 0 ? JSON.stringify(v) : null;
        else v = prev[col] === undefined ? null : prev[col];
      } else if (v === undefined) {
        // Absent on a NEW record: nullable columns stay NULL so a later
        // partial update that omits them does not invent a value.
        v = col === 'description' || col === 'icon' || col === 'due_date' || col === 'est_minutes' || col === 'completed_at' ? null : '';
      }
      colVals[col] = v;
    }
    const cols = ['id', 'user_id', ...COLS[entity], 'updated_at'];
    const params = [rec.id, userId, ...COLS[entity].map((c) => colVals[c]), ts];
    const updates = [...COLS[entity].map((c) => `${c} = excluded.${c}`), 'updated_at = excluded.updated_at'];
    db.prepare(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`
    ).run(...params);
    logChange(
      db, userId, entity, rec.id, false,
      rowToPayload(entity, { id: rec.id, ...colVals, updated_at: ts }), now
    );
  };

  for (const entity of ENTITIES) {
    const list = dirty?.[entity];
    if (Array.isArray(list)) for (const rec of list) upsert(entity, rec);
  }

  for (const t of dirty?.tombstones || []) {
    if (!t || !t.entity || !t.key) continue;
    const entity = String(t.entity);
    if (!ENTITIES.includes(entity)) continue;
    const ts = Number(t.updatedAt) > 0 ? Number(t.updatedAt) : now;
    const table = TABLE[entity];
    const record = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ? AND user_id = ?`).get(t.key, userId);
    if (record && record.updated_at > ts) {
      // The record was edited elsewhere after this deletion — keep it and
      // force it back to the sender so it does not diverge.
      const cur = fullRow(entity, t.key);
      if (cur) forced.push(cur);
      continue;
    }
    const prevTomb = db.prepare('SELECT updated_at FROM tombstones WHERE user_id = ? AND entity = ? AND key = ?').get(userId, entity, t.key);
    db.prepare(
      `INSERT INTO tombstones (user_id, entity, key, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, entity, key) DO UPDATE SET updated_at = MAX(updated_at, excluded.updated_at)`
    ).run(userId, entity, t.key, ts);
    if (record) {
      db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(t.key, userId);
    }
    // Log the deletion only when it is new information; re-pushed
    // tombstones (every sync sends the full local list) must not spam the log.
    if (!prevTomb || prevTomb.updated_at < ts) {
      logChange(db, userId, entity, t.key, true, null, now);
    }
  }

  if (dirty?.settings && typeof dirty.settings.data !== 'undefined') {
    const ts = Number(dirty.settings.updatedAt) > 0 ? Number(dirty.settings.updatedAt) : now;
    const existing = db.prepare('SELECT updated_at FROM settings WHERE user_id = ?').get(userId);
    if (!existing || existing.updated_at <= ts) {
      db.prepare(
        `INSERT INTO settings (user_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).run(userId, typeof dirty.settings.data === 'string' ? dirty.settings.data : JSON.stringify(dirty.settings.data), ts);
      logChange(db, userId, 'settings', 'settings', false, { data: dirty.settings.data, updatedAt: ts }, now);
    }
  }

  return { ok: true, forced };
}

/** All change_log rows with seq > cursor (ascending, capped). */
export function getChanges(db, userId, cursor, limit = 1000) {
  const rows = db
    .prepare('SELECT seq, entity, key, deleted, payload FROM change_log WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?')
    .all(userId, Number(cursor) || 0, limit);
  const last = db.prepare('SELECT COALESCE(MAX(seq), 0) AS c FROM change_log WHERE user_id = ?').get(userId).c;
  return {
    cursor: last,
    hasMore: rows.length === limit && rows[rows.length - 1].seq < last,
    changes: rows.map((r) => ({
      entity: r.entity,
      key: r.key,
      deleted: r.deleted === 1,
      payload: r.payload ? JSON.parse(r.payload) : null,
    })),
  };
}

export function getCursor(db, userId) {
  return db.prepare('SELECT COALESCE(MAX(seq), 0) AS c FROM change_log WHERE user_id = ?').get(userId).c;
}
