import {
  eventRepo, subjectRepo, todoRepo, tombstoneRepo, settingsRepo, eventEditRepo, dayNoteRepo,
  takeDirtySnapshot, clearDirtySnapshot, isSettingsDirty, clearSettingsDirty,
  subscribeRepoChanges, getSettingsRevision,
  type SyncEntity,
} from './repositories';
import type { CalendarEvent, Subject, TodoTask, UserSettings, EventTimeEdit, DayNote } from '../types';
import { getToken, getCursor, setCursor, apiFetch } from './auth';

export interface ServerChange {
  entity: string;
  key: string;
  deleted: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export interface ServerState {
  empty: boolean;
  subjects: Subject[];
  events: CalendarEvent[];
  todos: TodoTask[];
  eventEdits?: EventTimeEdit[];
  dayNotes?: DayNote[];
  tombstones: { entity: string; key: string }[];
  settings: { data: UserSettings; updatedAt: number } | null;
  cursor: number;
}

// ---- refresh bus: pages re-read the repos after remote changes arrive ----
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifySync(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

// Local writes fan out to the same subscribers immediately: a todo toggled,
// deleted or re-dated on the Todo page must move the sidebar dot at once,
// not on the next background pull.
subscribeRepoChanges(() => notifySync());

function hasLocalData(): boolean {
  return (
    eventRepo.getAll().length > 0 ||
    subjectRepo.getAll().length > 0 ||
    todoRepo.getAll().length > 0
  );
}

function withTs<T extends { updatedAt?: number }>(rec: T): T & { updatedAt: number } {
  return { ...rec, updatedAt: rec.updatedAt || 0 };
}

/**
 * Wire form of a todo.
 *
 * Optional columns have to travel as explicit `null`, not be omitted: JSON
 * drops keys whose value is `undefined`, and the server reads an absent key as
 * "inherit the existing row". Without this a cleared description, due date or
 * estimate would be silently resurrected on every other device.
 */
function dirtyTodo(rec: TodoTask) {
  return {
    ...withTs(rec),
    description: rec.description ?? null,
    dueDate: rec.dueDate ?? null,
    estMinutes: rec.estMinutes ?? null,
    subjectId: rec.subjectId ?? null,
    completedAt: rec.completedAt ?? null,
  } as unknown as TodoTask & { updatedAt: number };
}

function collectFullDirty() {
  return {
    subjects: subjectRepo.getAll().map(withTs),
    events: eventRepo.getAll().map(withTs),
    todos: todoRepo.getAll().map(dirtyTodo),
    eventEdits: eventEditRepo.getAll().map(withTs),
    dayNotes: dayNoteRepo.getAll().map(withTs),
    tombstones: tombstoneRepo.getAll().map((t) => ({ ...t })),
    settings: { data: settingsRepo.get(), updatedAt: settingsRepo.getWithMeta().updatedAt || 0 },
  };
}

function collectDirty() {
  const ids = takeDirtySnapshot();
  const dirty = {
    subjects: [] as Array<Subject & { updatedAt: number }>,
    events: [] as Array<CalendarEvent & { updatedAt: number }>,
    todos: [] as Array<TodoTask & { updatedAt: number }>,
    eventEdits: [] as Array<EventTimeEdit & { updatedAt: number }>,
    dayNotes: [] as Array<DayNote & { updatedAt: number }>,
    tombstones: tombstoneRepo.getAll().map((t) => ({ ...t })),
    settings: undefined as { data: UserSettings; updatedAt: number } | undefined,
  };
  for (const id of ids.subjects) {
    const rec = subjectRepo.getById(id);
    if (rec) dirty.subjects.push(withTs(rec));
  }
  for (const id of ids.events) {
    const rec = eventRepo.getById(id);
    if (rec) dirty.events.push(withTs(rec));
  }
  for (const id of ids.todos) {
    const rec = todoRepo.getById(id);
    if (rec) dirty.todos.push(dirtyTodo(rec));
  }
  for (const id of ids.eventEdits) {
    const rec = eventEditRepo.getById(id);
    if (rec) dirty.eventEdits.push(withTs(rec));
  }
  for (const id of ids.dayNotes) {
    const rec = dayNoteRepo.getAll().find((n) => n.id === id);
    if (rec) dirty.dayNotes.push(withTs(rec));
  }
  if (isSettingsDirty()) {
    const meta = settingsRepo.getWithMeta();
    dirty.settings = { data: meta.data, updatedAt: meta.updatedAt || 0 };
  }
  return { ids, dirty };
}

function applyChange(change: ServerChange): boolean {
  const entity = change.entity;
  if (change.deleted) {
    if (entity !== 'subjects' && entity !== 'events' && entity !== 'todos' && entity !== 'eventEdits') return false;
    const removed =
      entity === 'subjects' ? subjectRepo.removeLocal(change.key)
      : entity === 'events' ? eventRepo.removeLocal(change.key)
      : entity === 'todos' ? todoRepo.removeLocal(change.key)
      : eventEditRepo.removeLocal(change.key);
    if (removed) {
      // Remember the remote deletion so a stale local copy never comes back.
      const t = tombstoneRepo.getAll().find((x) => x.entity === entity && x.key === change.key);
      if (!t) {
        // add() would mark dirty — push the tombstone back is harmless but
        // noisy; record it quietly instead.
        tombstoneRepo.replaceAll([...tombstoneRepo.getAll(), { entity, key: change.key, updatedAt: Date.now() }]);
      }
    }
    return removed;
  }
  if (entity === 'subjects') return subjectRepo.applyRemote(change.payload as Subject);
  if (entity === 'events') return eventRepo.applyRemote(change.payload as CalendarEvent);
  if (entity === 'todos') return todoRepo.applyRemote(change.payload as TodoTask);
  if (entity === 'eventEdits') return eventEditRepo.applyRemote(change.payload as EventTimeEdit);
  if (entity === 'dayNotes') return dayNoteRepo.applyRemote(change.payload as DayNote);
  if (entity === 'settings' && change.payload) {
    const data = change.payload.data as UserSettings;
    const updatedAt = Number(change.payload.updatedAt) || 0;
    if (data) return settingsRepo.applyRemote(data, updatedAt);
  }
  return false;
}

/** Merge a full server snapshot (used on first sync when the account is not empty). */
function applyState(state: ServerState): boolean {
  // Never clobber records with unsynced local edits — they win the push below.
  const dirty = takeDirtySnapshot();
  const dirtyIds = new Set<string>();
  for (const list of [dirty.subjects, dirty.events, dirty.todos]) {
    for (const id of list) dirtyIds.add(id);
  }
  // Note ids are dates, which cannot collide with the uuids above.
  const dirtyNoteIds = new Set(dirty.dayNotes);
  let changed = false;
  for (const s of state.subjects) {
    if (!dirtyIds.has(s.id)) changed = subjectRepo.applyRemote(s) || changed;
  }
  for (const e of state.events) {
    if (!dirtyIds.has(e.id)) changed = eventRepo.applyRemote(e) || changed;
  }
  for (const t of state.todos) {
    if (!dirtyIds.has(t.id)) changed = todoRepo.applyRemote(t) || changed;
  }
  for (const ed of state.eventEdits || []) {
    if (!dirtyIds.has(ed.id)) changed = eventEditRepo.applyRemote(ed) || changed;
  }
  for (const n of state.dayNotes || []) {
    if (!dirtyNoteIds.has(n.id)) changed = dayNoteRepo.applyRemote(n) || changed;
  }
  for (const tomb of state.tombstones) {
    const entity = tomb.entity as SyncEntity;
    if (entity !== 'subjects' && entity !== 'events' && entity !== 'todos') continue;
    const removed =
      entity === 'subjects' ? subjectRepo.removeLocal(tomb.key)
      : entity === 'events' ? eventRepo.removeLocal(tomb.key)
      : todoRepo.removeLocal(tomb.key);
    changed = removed || changed;
    if (!tombstoneRepo.has(entity, tomb.key)) {
      tombstoneRepo.replaceAll([...tombstoneRepo.getAll(), { entity, key: tomb.key, updatedAt: Date.now() }]);
    }
  }
  if (state.settings) {
    if (!isSettingsDirty()) {
      // Full-state adoption: take the server settings outright so a legacy
      // or malformed local copy always heals on fresh login.
      settingsRepo.replaceAll(state.settings.data, Number(state.settings.updatedAt) || 0);
      changed = true;
    }
  }
  // Whatever remote tombstones exist must also exist locally.
  tombstoneRepo.replaceAll(
    state.tombstones
      .filter((t): t is { entity: SyncEntity; key: string } =>
        t.entity === 'subjects' || t.entity === 'events' || t.entity === 'todos')
      .map((t) => ({ entity: t.entity, key: t.key, updatedAt: Date.now() }))
  );
  return changed;
}

/**
 * First sync after login: adopt the server state, or import local data
 * into a fresh account (one-time migration of pre-account data).
 */
export async function initialSync(): Promise<void> {
  if (!getToken()) return;
  const stateRes = await apiFetch('/api/state');
  if (!stateRes.ok) throw new Error(`State fetch failed (${stateRes.status})`);
  const state = (await stateRes.json()) as ServerState;

  if (state.empty) {
    if (hasLocalData()) {
      const res = await apiFetch('/api/import', {
        method: 'POST',
        body: JSON.stringify(collectFullDirty()),
      });
      if (res.status === 409) {
        // Raced with another device — fall through to a normal pull.
      } else {
        if (!res.ok) throw new Error(`Import failed (${res.status})`);
        const data = await res.json();
        setCursor(Number(data.cursor) || 0);
        return;
      }
    } else {
      setCursor(Number(state.cursor) || 0);
      return;
    }
  }

  const changed = applyState(state);
  setCursor(Number(state.cursor) || 0);
  if (changed) notifySync();
  // Push anything local the server does not have yet (e.g. offline edits
  // made before the first login).
  await syncOnce();
}

/** In-flight cycle, shared by concurrent callers (timer + background sync). */
let inFlight: Promise<boolean> | null = null;
let rerun: Promise<boolean> | null = null;

/** One push/pull cycle against the cursor. Returns true when anything changed locally. */
export async function syncOnce(): Promise<boolean> {
  if (!getToken()) return false;
  // Two callers at once (the 15s session poll and the 90s background tick)
  // would race on the cursor and on clearing the dirty set. Share one cycle.
  if (inFlight) {
    // The running cycle already took its snapshot of local changes, so a write
    // made meanwhile (session start/stop) needs one more cycle right after it.
    if (!rerun) {
      rerun = inFlight
        .catch(() => false)
        .then(() => {
          rerun = null;
          return syncOnce();
        });
    }
    return rerun;
  }
  inFlight = runCycle().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runCycle(): Promise<boolean> {
  const settingsRev = getSettingsRevision();
  const { ids, dirty } = collectDirty();
  const hasDirty =
    dirty.subjects.length > 0 || dirty.events.length > 0 || dirty.todos.length > 0 ||
    dirty.eventEdits.length > 0 || dirty.dayNotes.length > 0 || dirty.tombstones.length > 0 || dirty.settings !== undefined;
  let cursor = getCursor();
  let guard = 0;
  let changed = false;

  // Loop while the server reports more pages (large accounts).
  for (;;) {
    const res = await apiFetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ cursor, dirty: guard === 0 ? dirty : undefined }),
    });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    const data = await res.json();
    cursor = Number(data.cursor) || cursor;
    setCursor(cursor);
    for (const change of (data.changes || []) as ServerChange[]) {
      changed = applyChange(change) || changed;
    }
    guard++;
    if (!data.hasMore || guard > 10) break;
  }

  if (hasDirty) {
    clearDirtySnapshot(ids);
    if (dirty.settings !== undefined && settingsRev === getSettingsRevision()) clearSettingsDirty();
    // Tombstones are resent every cycle; nothing to clear for them.
  }
  if (changed) notifySync();
  return changed;
}
