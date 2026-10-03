import type {
  Subject, CalendarEvent, UserSettings, TodoTask, ThemeMode, SyncedSession, EventTimeEdit,
} from '../types';
import { PLAN_FIX_WINDOW_MS } from '../utils/analytics';

export type SyncEntity = 'subjects' | 'events' | 'todos' | 'eventEdits';

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
  eventEdits: 'cdmm.eventEdits',
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

export function takeDirtySnapshot(): {
  subjects: string[]; events: string[]; todos: string[]; eventEdits: string[];
} {
  const out = {
    subjects: [] as string[], events: [] as string[], todos: [] as string[], eventEdits: [] as string[],
  };
  for (const e of loadDirty()) {
    const [entity, ...rest] = e.split(':');
    const key = rest.join(':');
    if (entity === 'subjects' || entity === 'events' || entity === 'todos' || entity === 'eventEdits') {
      (out[entity] as string[]).push(key);
    }
  }
  return out;
}

export function clearDirtySnapshot(keys: {
  subjects: string[]; events: string[]; todos: string[]; eventEdits: string[];
}): void {
  const entries: string[] = [];
  for (const entity of ['subjects', 'events', 'todos', 'eventEdits'] as const) {
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
const SUBJECTS_BACKFILL_KEY = 'cdmm.subjects-backfill-v1';

/**
 * Safety limits for the plan-stability log: two years of history (the longest
 * selectable period is a year) and a hard entry count so localStorage can never
 * grow without bound. Hitting either one is visible in the UI — the "tracking
 * since" line is derived from the oldest surviving entry.
 */
const MAX_EDIT_LOG = 4000;
const EDIT_LOG_MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000;

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

/**
 * One-time repair for subjects that exist locally but never reached the
 * server (lost dirty flags): re-mark every local subject as dirty so the
 * next sync pushes the full local set and the account converges.
 */
export function backfillSubjects(): boolean {
  try {
    if (localStorage.getItem(SUBJECTS_BACKFILL_KEY)) return false;
  } catch {
    return false;
  }
  try {
    for (const s of subjectRepo.getAll()) {
      markDirty('subjects', s.id);
    }
    localStorage.setItem(SUBJECTS_BACKFILL_KEY, '1');
  } catch {
    // storage unavailable — try again next boot
  }
  return true;
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

/**
 * Optional columns arrive as explicit nulls on the wire (JSON drops undefined
 * keys, so a cleared value has to travel as null). Normalize them back to
 * `undefined` once, at the edge, and the rest of the app never sees a null.
 */
function cleanTodo(rec: TodoTask): TodoTask {
  return {
    ...rec,
    description: rec.description ?? undefined,
    dueDate: rec.dueDate ?? undefined,
    estMinutes: rec.estMinutes ?? undefined,
    subjectId: rec.subjectId || undefined,
    completedAt: rec.completedAt ?? undefined,
  };
}

/**
 * The plan-stability log: an append-only record of every change that moved an
 * event in the calendar. Entries are only written by local user edits (see
 * EventRepository.update) — a change made on another device travels here as
 * its own entry, so logging on sync would double-count it.
 */
class EventEditRepository {
  private edits: EventTimeEdit[] = load<EventTimeEdit[]>(STORAGE_KEYS.eventEdits, []).filter(
    (e) => e && typeof e.eventId === 'string' && Number.isFinite(e.at)
  );

  getAll(): EventTimeEdit[] {
    return [...this.edits];
  }

  getById(id: string): EventTimeEdit | undefined {
    return this.edits.find((e) => e.id === id);
  }

  record(entry: Omit<EventTimeEdit, 'id' | 'at' | 'updatedAt'>): EventTimeEdit {
    const at = Date.now();
    const edit: EventTimeEdit = { ...entry, id: genId(), at, updatedAt: at };
    this.edits.push(edit);
    // The log only feeds period statistics, and a year-old entry can no longer
    // land in any of them — drop it instead of growing without bound.
    const cutoff = at - EDIT_LOG_MAX_AGE_MS;
    let kept = this.edits.filter((e) => e.at >= cutoff);
    if (kept.length > MAX_EDIT_LOG) kept = kept.slice(-MAX_EDIT_LOG);
    this.edits = kept;
    save(STORAGE_KEYS.eventEdits, this.edits);
    markDirty('eventEdits', edit.id);
    return edit;
  }

  /** Apply a remote entry (LWW). Never marks dirty. */
  applyRemote(rec: EventTimeEdit): boolean {
    const idx = this.edits.findIndex((e) => e.id === rec.id);
    if (idx === -1) {
      this.edits.push(rec);
      save(STORAGE_KEYS.eventEdits, this.edits);
      return true;
    }
    if ((rec.updatedAt || 0) > (this.edits[idx].updatedAt || 0)) {
      this.edits[idx] = rec;
      save(STORAGE_KEYS.eventEdits, this.edits);
      return true;
    }
    return false;
  }

  removeLocal(id: string): boolean {
    const before = this.edits.length;
    this.edits = this.edits.filter((e) => e.id !== id);
    if (this.edits.length < before) {
      save(STORAGE_KEYS.eventEdits, this.edits);
      return true;
    }
    return false;
  }

  replaceAll(edits: EventTimeEdit[]): void {
    this.edits = edits;
    save(STORAGE_KEYS.eventEdits, this.edits);
  }
}

class TodoRepository {
  private todos: TodoTask[] = load<TodoTask[]>(STORAGE_KEYS.todos, []).map((t) => cleanTodo(t));

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

  /**
   * `completedAt` is maintained here rather than in the UI: any path that
   * ticks a task off (checkbox, quadrant dialog, undo of an unrelated edit)
   * stamps the moment, and reopening clears it again. Statistics then read a
   * real completion time instead of `updatedAt`, which any later edit — the
   * due-date promotion included — would move.
   */
  update(id: string, data: Partial<TodoTask>): TodoTask | undefined {
    const idx = this.todos.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    const prev = this.todos[idx];
    const next: TodoTask = { ...prev, ...data, id, updatedAt: Date.now() };
    if (data.completed !== undefined && data.completed !== prev.completed) {
      next.completedAt = data.completed ? data.completedAt || new Date().toISOString() : undefined;
    }
    this.todos[idx] = next;
    save(STORAGE_KEYS.todos, this.todos);
    markDirty('todos', id);
    emitRepoChange();
    return next;
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
    const clean = cleanTodo(rec);
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

/**
 * Log a write that moves a planned block to a different slot in the calendar —
 * another day, another start, another end, a different duration.
 *
 * This is the exact line between "the plan moved" and "the content changed":
 * adding a task inside a block, retitling it or recolouring it never shifts a
 * timestamp, so those edits stay out of the plan-stability log. A drag or a
 * resize commits here, which is why a move is counted once, at the moment the
 * calendar actually changed.
 *
 * Finished focus sessions are skipped on purpose: they are what actually
 * happened, not a plan, so correcting one is not a replan. Blocks excluded
 * from statistics are skipped for the same reason — they are not part of the
 * plan this metric describes.
 */
function recordTimeChange(prev: CalendarEvent, next: CalendarEvent): void {
  if (next.kind !== 'plan' || next.countInStats === false) return;
  const fromStart = new Date(prev.start).getTime();
  const fromEnd = new Date(prev.end).getTime();
  const toStart = new Date(next.start).getTime();
  const toEnd = new Date(next.end).getTime();
  if (!Number.isFinite(fromStart) || !Number.isFinite(fromEnd)) return;
  if (!Number.isFinite(toStart) || !Number.isFinite(toEnd)) return;
  if (fromStart === toStart && fromEnd === toEnd) return;
  eventEditRepo.record({
    eventId: next.id,
    fromStart: prev.start,
    fromEnd: prev.end,
    toStart: next.start,
    toEnd: next.end,
    title: next.title,
    subjectId: next.subjectId,
    kind: 'plan',
    countInStats: true,
  });
}

/**
 * Log the removal of a planned block, so plan stability can charge its whole
 * length as lost. Same skip list as `recordTimeChange`: real sessions are not
 * part of the plan, and an excluded block was never counted.
 *
 * Undo restores records through `replaceAll`, which never logs, so reverting a
 * deletion does not also undo the loss it booked.
 *
 * A block removed inside its grace period is skipped here rather than in the
 * statistics: once the event is gone nothing remembers when it was created, and
 * the rule is that a length which never got fixed was never committed — so it
 * leaves no entry and no loss. `PLAN_FIX_WINDOW_MS` is imported from the
 * analytics so the window is defined in exactly one place.
 */
function recordDeletion(event: CalendarEvent): void {
  if (event.kind !== 'plan' || event.countInStats === false) return;
  if (!Number.isFinite(new Date(event.start).getTime())) return;
  if (!Number.isFinite(new Date(event.end).getTime())) return;
  if (event.createdAt) {
    const createdMs = new Date(event.createdAt).getTime();
    if (Number.isFinite(createdMs) && Date.now() < createdMs + PLAN_FIX_WINDOW_MS) return;
  }
  eventEditRepo.record({
    eventId: event.id,
    fromStart: event.start,
    fromEnd: event.end,
    toStart: event.start,
    toEnd: event.end,
    title: event.title,
    subjectId: event.subjectId,
    kind: 'plan',
    countInStats: true,
    deleted: true,
  });
}

class EventRepository {
  private events: CalendarEvent[] = load<CalendarEvent[]>(STORAGE_KEYS.events, []);

  getAll(): CalendarEvent[] {
    return [...this.events];
  }

  getById(id: string): CalendarEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  create(event: Omit<CalendarEvent, 'id' | 'uid' | 'updatedAt'> & { id?: string; uid?: string; createdAt?: string }): CalendarEvent {
    const id = event.id || genId();
    const newEvent: CalendarEvent = {
      ...event,
      id,
      uid: event.uid || `evt-${id}@cdmm`,
      // Stamped once, never touched again: it is the anchor for the plan-
      // stability grace period. A re-create with a known id (a closed session
      // overwriting its placeholder) keeps the original stamp.
      createdAt: event.createdAt || new Date().toISOString(),
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

  /**
   * `restoring` marks a write that puts the record back the way it was — the
   * editor's Cancel undoing a drag that auto-opened it. That rollback is not
   * the user changing their plan, so it stays out of the plan-stability log.
   */
  update(
    id: string,
    data: Partial<CalendarEvent>,
    opts?: { restoring?: boolean }
  ): CalendarEvent | undefined {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    const prev = this.events[idx];
    const next: CalendarEvent = { ...prev, ...data, id, updatedAt: Date.now() };
    if (!opts?.restoring) recordTimeChange(prev, next);
    this.events[idx] = next;
    save(STORAGE_KEYS.events, this.events);
    markDirty('events', id);
    emitRepoChange();
    return next;
  }

  delete(id: string): boolean {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    // A fixed planned block that disappears takes its whole length with it.
    // Record that, or plan stability would never know what was lost.
    recordDeletion(this.events[idx]);
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    if (this.events.length < before) {
      save(STORAGE_KEYS.events, this.events);
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
export const eventEditRepo = new EventEditRepository();

/** Wipe all local data (logout / account switch). */
export function clearAllLocalData(): void {
  subjectRepo.replaceAll([]);
  eventRepo.replaceAll([]);
  todoRepo.replaceAll([]);
  eventEditRepo.replaceAll([]);
  tombstoneRepo.replaceAll([]);
  persistDirty(new Set());
  save(STORAGE_KEYS.settingsDirty, false);
  // Keep the theme (it is a device preference) but drop the live session —
  // it belongs to the account we just signed out of.
  settingsRepo.setActiveSession(null);
}
