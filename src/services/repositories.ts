import type { Subject, CalendarEvent, UserSettings, TodoTask } from '../types';

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
    return newSubject;
  }

  update(id: string, data: Partial<Subject>): Subject | undefined {
    const idx = this.subjects.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    this.subjects[idx] = { ...this.subjects[idx], ...data, id, updatedAt: Date.now() };
    save(STORAGE_KEYS.subjects, this.subjects);
    markDirty('subjects', id);
    return this.subjects[idx];
  }

  delete(id: string): boolean {
    const before = this.subjects.length;
    this.subjects = this.subjects.filter((s) => s.id !== id);
    save(STORAGE_KEYS.subjects, this.subjects);
    return this.subjects.length < before;
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
  private todos: TodoTask[] = load<TodoTask[]>(STORAGE_KEYS.todos, []);

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
    return newTodo;
  }

  update(id: string, data: Partial<TodoTask>): TodoTask | undefined {
    const idx = this.todos.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    this.todos[idx] = { ...this.todos[idx], ...data, id, updatedAt: Date.now() };
    save(STORAGE_KEYS.todos, this.todos);
    markDirty('todos', id);
    return this.todos[idx];
  }

  delete(id: string): boolean {
    const before = this.todos.length;
    this.todos = this.todos.filter((t) => t.id !== id);
    save(STORAGE_KEYS.todos, this.todos);
    return this.todos.length < before;
  }

  /** Apply a remote record (LWW). Never marks dirty. */
  applyRemote(rec: TodoTask): boolean {
    const idx = this.todos.findIndex((t) => t.id === rec.id);
    if (idx === -1) {
      this.todos.push(rec);
      save(STORAGE_KEYS.todos, this.todos);
      return true;
    }
    if ((rec.updatedAt || 0) > (this.todos[idx].updatedAt || 0)) {
      this.todos[idx] = rec;
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
    this.events.push(newEvent);
    save(STORAGE_KEYS.events, this.events);
    markDirty('events', id);
    return newEvent;
  }

  update(id: string, data: Partial<CalendarEvent>): CalendarEvent | undefined {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    this.events[idx] = { ...this.events[idx], ...data, id, updatedAt: Date.now() };
    save(STORAGE_KEYS.events, this.events);
    markDirty('events', id);
    return this.events[idx];
  }

  delete(id: string): boolean {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    save(STORAGE_KEYS.events, this.events);
    return this.events.length < before;
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

class SettingsRepository {
  private settings: UserSettings = load<UserSettings>(STORAGE_KEYS.settings, {
    dailyGoalMinutes: 360,
    theme: 'light',
  });
  private updatedAt: number = load<number>('cdmm.settingsUpdatedAt', 0);

  get(): UserSettings {
    return { ...this.settings };
  }

  getWithMeta(): StoredSettings {
    return { data: this.get(), updatedAt: this.updatedAt };
  }

  update(data: Partial<UserSettings>): UserSettings {
    if (data.dailyGoalMinutes !== undefined) {
      this.settings.dailyGoalMinutes = data.dailyGoalMinutes;
    }
    if (data.theme) {
      this.settings.theme = data.theme;
    }
    this.updatedAt = Date.now();
    save(STORAGE_KEYS.settings, this.settings);
    save('cdmm.settingsUpdatedAt', this.updatedAt);
    markSettingsDirty();
    return this.get();
  }

  /** Apply remote settings (LWW). Never marks dirty. */
  applyRemote(data: UserSettings, updatedAt: number): boolean {
    if (updatedAt > this.updatedAt) {
      this.settings = { ...data };
      this.updatedAt = updatedAt;
      save(STORAGE_KEYS.settings, this.settings);
      save('cdmm.settingsUpdatedAt', this.updatedAt);
      return true;
    }
    return false;
  }

  replaceAll(data: UserSettings, updatedAt: number): void {
    this.settings = { ...data };
    this.updatedAt = updatedAt;
    save(STORAGE_KEYS.settings, this.settings);
    save('cdmm.settingsUpdatedAt', this.updatedAt);
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
}
