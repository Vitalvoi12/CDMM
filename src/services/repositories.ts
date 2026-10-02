import type {
  Subject, CalendarEvent, UserSettings, TodoTask, ThemeMode, SyncedSession,
} from '../types';

export type SyncEntity = 'subjects' | 'events' | 'todos';

export interface Tombstone {
  entity: SyncEntity;
  key: string;
  updatedAt: number;
}

const STORAGE_KEYS = {
  subjects: 'cdmm.subjects',
  events: 'cdmm.events',
  settings: 'cdmm.settings',
  tombstones: 'cdmm.tombstones',
  todos: 'cdmm.todos',
  dirty: 'cdmm.dirty',
  settingsDirty: 'cdmm.settingsDirty',
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * crypto.randomUUID() exists only in secure contexts (https / localhost).
 * A phone reaching the dev server over LAN http://<ip> is NOT a secure
 * context, so fall back to a Math.random-based uuid v4 there.
 */
export function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — ignore
  }
}

/**
 * Dirty set: ids changed since the last successful sync push.
 * Persisted so a reload never loses unsynced edits.
 */
function loadDirty(): Set<string> {
  return new Set(load<string[]>(STORAGE_KEYS.dirty, []));
}

function persistDirty(set: Set<string>): void {
  save(STORAGE_KEYS.dirty, [...set]);
}

export function markDirty(entity: SyncEntity, key: string): void {
  const d = loadDirty();
  d.add(`${entity}:${key}`);
  persistDirty(d);
}

// ---- local-change bus ----
// Emitted on every user write (create/update/delete) so mounted components
// refresh instantly instead of waiting for the next background sync pull.
// serverSync bridges this into its own refresh bus; remote/undo paths notify
// through their existing channels, so they stay silent here.
type RepoChangeListener = () => void;
const repoChangeListeners = new Set<RepoChangeListener>();

export function subscribeRepoChanges(fn: RepoChangeListener): () => void {
  repoChangeListeners.add(fn);
  return () => {
    repoChangeListeners.delete(fn);
  };
}

function emitRepoChange(): void {
  for (const fn of repoChangeListeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

function unmarkDirty(entries: string[]): void {
  if (entries.length === 0) return;
  const d = loadDirty();
  for (const e of entries) d.delete(e);
  persistDirty(d);
}

export function takeDirtySnapshot(): { subjects: string[]; events: string[]; todos: string[] } {
  const out = { subjects: [] as string[], events: [] as string[], todos: [] as string[] };
  for (const e of loadDirty()) {
    const [entity, ...rest] = e.split(':');
    const key = rest.join(':');
    if (entity === 'subjects' || entity === 'events' || entity === 'todos') {
      (out[entity] as string[]).push(key);
    }
  }
  return out;
}

export function clearDirtySnapshot(keys: { subjects: string[]; events: string[]; todos: string[] }): void {
  const entries: string[] = [];
  for (const entity of ['subjects', 'events', 'todos'] as const) {
    for (const k of keys[entity]) entries.push(`${entity}:${k}`);
  }
  unmarkDirty(entries);
}

export function isSettingsDirty(): boolean {
  return load<boolean>(STORAGE_KEYS.settingsDirty, false);
}

export function markSettingsDirty(): void {
  save(STORAGE_KEYS.settingsDirty, true);
}

const CHECKLIST_BACKFILL_KEY = 'cdmm.checklist-backfill-v1';

/**
 * One-time repair for checklists pushed while the server did not know the
 * column yet: the server dropped them but the push cleared the dirty flag,
 * so the records look clean and would never be re-sent. Re-mark every event
 * that still holds local tasks as dirty — the next sync pushes them whole.
 */
export function backfillEventChecklists(): boolean {
  try {
    if (localStorage.getItem(CHECKLIST_BACKFILL_KEY)) return false;
  } catch {
    return false;
  }
  let marked = false;
  try {
    for (const e of eventRepo.getAll()) {
      if (e.checklist && e.checklist.length > 0) {
        markDirty('events', e.id);
        marked = true;
      }
    }
    localStorage.setItem(CHECKLIST_BACKFILL_KEY, '1');
  } catch {
    // storage unavailable — try again next boot
  }
  return marked;
}

export function clearSettingsDirty(): void {
  save(STORAGE_KEYS.settingsDirty, false);
}

class SubjectRepository {
  private subjects: Subject[] = load<Subject[]>(STORAGE_KEYS.subjects, []);

  getAll(): Subject[] {
    return [...this.subjects];
  }

  getById(id: string): Subject | undefined {
    return this.subjects.find((s) => s.id === id);
  }

  create(subject: Omit<Subject, 'id' | 'updatedAt'>): Subject {
    const newSubject: Subject = { ...subject, id: genId(), updatedAt: Date.now() };
    this.subjects.push(newSubject);
    save(STORAGE_KEYS.subjects, this.subjects);
    markDirty('subjects', newSubject.id);
    emitRepoChange();
    return newSubject;
  }

  update(id: string, data: Partial<Subject>): Subject | undefined {
    const idx = this.subjects.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    this.subjects[idx] = { ...this.subjects[idx], ...data, id, updatedAt: Date.now() };
    save(STORAGE_KEYS.subjects, this.subjects);
    markDirty('subjects', id);
    emitRepoChange();
    return this.subjects[idx];
  }

  delete(id: string): boolean {
    const before = this.subjects.length;
    this.subjects = this.subjects.filter((s) => s.id !== id);
    save(STORAGE_KEYS.subjects, this.subjects);
    if (this.subjects.length < before) {
      emitRepoChange();
      return true;
    }
    return false;
  }

  /** Apply a remote record (LWW). Never marks dirty. */
  applyRemote(rec: Subject): boolean {
    const idx = this.subjects.findIndex((s) => s.id === rec.id);
    if (idx === -1) {
      this.subjects.push(rec);
      save(STORAGE_KEYS.subjects, this.subjects);
      return true;
    }
    if ((rec.updatedAt || 0) > (this.subjects[idx].updatedAt || 0)) {
      this.subjects[idx] = rec;
      save(STORAGE_KEYS.subjects, this.subjects);
      return true;
    }
    return false;
  }

  removeLocal(id: string): boolean {
    const before = this.subjects.length;
    this.subjects = this.subjects.filter((s) => s.id !== id);
    if (this.subjects.length < before) {
      save(STORAGE_KEYS.subjects, this.subjects);
      return true;
    }
    return false;
  }

  replaceAll(subjects: Subject[]): void {
    this.subjects = subjects;
    save(STORAGE_KEYS.subjects, this.subjects);
  }
}

class TodoRepository {
  private todos: TodoTask[] = load<TodoTask[]>(STORAGE_KEYS.todos, []).map((t) => ({
    ...t,
    description: t.description ?? undefined,
    dueDate: t.dueDate ?? undefined,
    estMinutes: t.estMinutes ?? undefined,
  }));

  getAll(): TodoTask[] {
    return [...this.todos];
  }

  getById(id: string): TodoTask | undefined {
    return this.todos.find((t) => t.id === id);
  }

  create(todo: Omit<TodoTask, 'id' | 'createdAt' | 'uid' | 'updatedAt'> & { uid?: string; id?: string; createdAt?: string }): TodoTask {
    const id = todo.id || genId();
    const newTodo: TodoTask = {
      ...todo,
      id,
      uid: todo.uid || `${id}@cdmm`,
      createdAt: todo.createdAt || new Date().toISOString(),
      updatedAt: Date.now(),
    };
    this.todos.push(newTodo);
    save(STORAGE_KEYS.todos, this.todos);
    markDirty('todos', id);
    emitRepoChange();
    return newTodo;
  }

  update(id: string, data: Partial<TodoTask>): TodoTask | undefined {
    const idx = this.todos.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    this.todos[idx] = { ...this.todos[idx], ...data, id, updatedAt: Date.now() };
    save(STORAGE_KEYS.todos, this.todos);
    markDirty('todos', id);
    emitRepoChange();
    return this.todos[idx];
  }

  delete(id: string): boolean {
    const before = this.todos.length;
    this.todos = this.todos.filter((t) => t.id !== id);
    save(STORAGE_KEYS.todos, this.todos);
    if (this.todos.length < before) {
      emitRepoChange();
      return true;
    }
    return false;
  }

  /** Apply a remote record (LWW). Never marks dirty. */
  applyRemote(rec: TodoTask): boolean {
    // Optional columns arrive as explicit nulls on the wire; keep them out of
    // the in-memory model so `task.dueDate` stays a plain optional string.
    const clean: TodoTask = {
      ...rec,
      description: rec.description ?? undefined,
      dueDate: rec.dueDate ?? undefined,
      estMinutes: rec.estMinutes ?? undefined,
    };
    const idx = this.todos.findIndex((t) => t.id === rec.id);
    if (idx === -1) {
      this.todos.push(clean);
      save(STORAGE_KEYS.todos, this.todos);
      return true;
    }
    if ((clean.updatedAt || 0) > (this.todos[idx].updatedAt || 0)) {
      this.todos[idx] = clean;
      save(STORAGE_KEYS.todos, this.todos);
      return true;
    }
    return false;
  }

  removeLocal(id: string): boolean {
    const before = this.todos.length;
    this.todos = this.todos.filter((t) => t.id !== id);
    if (this.todos.length < before) {
      save(STORAGE_KEYS.todos, this.todos);
      return true;
    }
    return false;
  }

  replaceAll(todos: TodoTask[]): void {
    this.todos = todos;
    save(STORAGE_KEYS.todos, this.todos);
  }
}

class EventRepository {
  private events: CalendarEvent[] = load<CalendarEvent[]>(STORAGE_KEYS.events, []);

  getAll(): CalendarEvent[] {
    return [...this.events];
  }

  getById(id: string): CalendarEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  create(event: Omit<CalendarEvent, 'id' | 'uid' | 'updatedAt'> & { id?: string; uid?: string }): CalendarEvent {
    const id = event.id || genId();
    const newEvent: CalendarEvent = {
      ...event,
      id,
      uid: event.uid || `evt-${id}@cdmm`,
      updatedAt: Date.now(),
    };
    // A closed session writes an event keyed by the session id, so two devices
    // finishing the same session at once converge on ONE row instead of two.
    const existing = this.events.findIndex((e) => e.id === id);
    if (existing !== -1) {
      this.events[existing] = newEvent;
    } else {
      this.events.push(newEvent);
    }
    save(STORAGE_KEYS.events, this.events);
    markDirty('events', id);
    emitRepoChange();
    return newEvent;
  }

  update(id: string, data: Partial<CalendarEvent>): CalendarEvent | undefined {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    this.events[idx] = { ...this.events[idx], ...data, id, updatedAt: Date.now() };
    save(STORAGE_KEYS.events, this.events);
    markDirty('events', id);
    emitRepoChange();
    return this.events[idx];
  }

  delete(id: string): boolean {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    save(STORAGE_KEYS.events, this.events);
    if (this.events.length < before) {
      emitRepoChange();
      return true;
    }
    return false;
  }

  /** Apply a remote record (LWW). Never marks dirty. */
  applyRemote(rec: CalendarEvent): boolean {
    const idx = this.events.findIndex((e) => e.id === rec.id);
    if (idx === -1) {
      this.events.push(rec);
      save(STORAGE_KEYS.events, this.events);
      return true;
    }
    if ((rec.updatedAt || 0) > (this.events[idx].updatedAt || 0)) {
      this.events[idx] = rec;
      save(STORAGE_KEYS.events, this.events);
      return true;
    }
    return false;
  }

  removeLocal(id: string): boolean {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    if (this.events.length < before) {
      save(STORAGE_KEYS.events, this.events);
      return true;
    }
    return false;
  }

  replaceAll(events: CalendarEvent[]): void {
    this.events = events;
    save(STORAGE_KEYS.events, this.events);
  }
}

export interface StoredSettings {
  data: UserSettings;
  updatedAt: number;
}

/** Legacy theme values map onto the current light/dark pair. */
function migrateTheme(t: unknown): ThemeMode {
  if (t === 'dark' || t === 'mocha' || t === 'bw-dark') return 'dark';
  if (t === 'light' || t === 'bw' || t === 'latte') return 'light';
  return 'dark';
}

const STAMP_KEY = 'cdmm.settingsUpdatedAt';

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Remote settings arrive untrusted — keep only the fields we understand. */
function sanitizeSession(raw: unknown): SyncedSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const subjectId = str(r.subjectId);
  const start = str(r.start);
  if (!subjectId || !start || Number.isNaN(new Date(start).getTime())) return null;
  return {
    id: str(r.id) || `${subjectId}:${start}`,
    subjectId,
    start,
    pausedAt: str(r.pausedAt),
    bankedMs: num(r.bankedMs),
    updatedAt: num(r.updatedAt),
  };
}

/**
 * The single synced settings record: the theme plus the live study session.
 *
 * The server treats the record as one blob with one `updatedAt`, but the
 * session needs its OWN clock: without it, a theme change on one device would
 * silently drop a session another device had just ended. So every write stamps
 * `activeSessionAt` next to the value, and remote records are merged field by
 * field instead of being overwritten wholesale.
 */
class SettingsRepository {
  private settings: UserSettings = (() => {
    const loaded = load<UserSettings>(STORAGE_KEYS.settings, { theme: 'dark' });
    const raw = loaded as unknown as Record<string, unknown>;
    const theme = migrateTheme(raw.theme);
    const next: UserSettings = {
      theme,
      activeSession: sanitizeSession(raw.activeSession),
      activeSessionAt: num(raw.activeSessionAt),
    };
    // Drop legacy fields (e.g. dailyGoalMinutes) — never persist them again.
    if (
      theme !== raw.theme ||
      raw.dailyGoalMinutes !== undefined ||
      JSON.stringify(next) !== JSON.stringify(loaded)
    ) {
      save(STORAGE_KEYS.settings, next);
      return next;
    }
    return loaded;
  })();
  private updatedAt: number = load<number>(STAMP_KEY, 0);

  get(): UserSettings {
    return { ...this.settings };
  }

  getWithMeta(): StoredSettings {
    return { data: this.get(), updatedAt: this.updatedAt };
  }

  update(data: Partial<UserSettings>): UserSettings {
    if (data.theme) this.settings.theme = data.theme;
    this.write(Date.now(), true);
    return this.get();
  }

  /** Start / mutate / clear the live session. Stamps the session LWW clock. */
  setActiveSession(session: SyncedSession | null, at: number = Date.now()): void {
    this.settings.activeSession = session ? { ...session, updatedAt: at } : null;
    this.settings.activeSessionAt = at;
    this.write(Date.now(), true);
  }

  /**
   * `recordTs` is the timestamp the settings record itself carries: the local
   * clock for our own writes, the server's stamp when adopting a remote one.
   */
  private write(recordTs: number, markDirty: boolean): void {
    this.updatedAt = recordTs;
    save(STORAGE_KEYS.settings, this.settings);
    save(STAMP_KEY, this.updatedAt);
    if (markDirty) markSettingsDirty();
  }

  /**
   * Merge a remote record field by field (LWW per field). Returns true when
   * anything local actually changed.
   *
   * Deliberately NOT gated on the record-level `updatedAt`: a stale blob from
   * another device must still be able to deliver a newer session, and a newer
   * blob must never resurrect a session we already ended.
   */
  applyRemote(data: UserSettings, updatedAt: number): boolean {
    let changed = false;
    const remote = (data ?? {}) as unknown as Record<string, unknown>;

    const sessionAt = num(remote.activeSessionAt, num((remote.activeSession as Record<string, unknown> | null)?.updatedAt));
    if (sessionAt > num(this.settings.activeSessionAt)) {
      this.settings.activeSessionAt = sessionAt;
      this.settings.activeSession = sanitizeSession(remote.activeSession);
      changed = true;
    }

    const remoteTs = num(updatedAt);
    if (remoteTs > this.updatedAt) {
      const theme = migrateTheme(remote.theme);
      if (theme !== this.settings.theme) {
        this.settings.theme = theme;
        changed = true;
      }
    }

    // Keep the local record stamp monotonic: a remote blob older than what we
    // already hold must not walk our clock backwards.
    if (changed) this.write(Math.max(remoteTs, this.updatedAt), false);
    return changed;
  }

  /** Full-state adoption on login — same per-field merge as applyRemote. */
  replaceAll(data: UserSettings, updatedAt: number): void {
    this.applyRemote(data, updatedAt);
  }
}

/**
 * Tombstones: (entity, key) pairs deleted locally, so the deletion
 * propagates to other devices instead of resurrecting the record.
 */
class TombstoneRepository {
  private tombs: Tombstone[] = load<Tombstone[]>(STORAGE_KEYS.tombstones, []);

  getAll(): Tombstone[] {
    return [...this.tombs];
  }

  add(entity: SyncEntity, key: string): void {
    if (!key) return;
    if (this.tombs.some((t) => t.entity === entity && t.key === key)) return;
    this.tombs.push({ entity, key, updatedAt: Date.now() });
    save(STORAGE_KEYS.tombstones, this.tombs);
    markDirty(entity, key);
  }

  has(entity: SyncEntity, key: string): boolean {
    return this.tombs.some((t) => t.entity === entity && t.key === key);
  }

  remove(entity: SyncEntity, key: string): void {
    const before = this.tombs.length;
    this.tombs = this.tombs.filter((t) => !(t.entity === entity && t.key === key));
    if (this.tombs.length < before) save(STORAGE_KEYS.tombstones, this.tombs);
  }

  replaceAll(tombs: Tombstone[]): void {
    this.tombs = tombs;
    save(STORAGE_KEYS.tombstones, this.tombs);
  }
}

export const subjectRepo = new SubjectRepository();
export const eventRepo = new EventRepository();
export const settingsRepo = new SettingsRepository();
export const tombstoneRepo = new TombstoneRepository();
export const todoRepo = new TodoRepository();

/** Wipe all local data (logout / account switch). */
export function clearAllLocalData(): void {
  subjectRepo.replaceAll([]);
  eventRepo.replaceAll([]);
  todoRepo.replaceAll([]);
  tombstoneRepo.replaceAll([]);
  persistDirty(new Set());
  save(STORAGE_KEYS.settingsDirty, false);
  // Keep the theme (it is a device preference) but drop the live session —
  // it belongs to the account we just signed out of.
  settingsRepo.setActiveSession(null);
}
