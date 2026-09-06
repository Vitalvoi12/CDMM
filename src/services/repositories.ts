import type { Subject, CalendarEvent, UserSettings, TodoTask } from '../types';

const STORAGE_KEYS = {
  subjects: 'studytracker.subjects',
  events: 'studytracker.events',
  settings: 'studytracker.settings',
  tombstones: 'studytracker.tombstones',
  lastSyncHash: 'studytracker.lastSyncHash',
  todos: 'studytracker.todos',
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

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — ignore
  }
}

class SubjectRepository {
  private subjects: Subject[] = load<Subject[]>(STORAGE_KEYS.subjects, []);

  getAll(): Subject[] {
    return [...this.subjects];
  }

  getById(id: string): Subject | undefined {
    return this.subjects.find((s) => s.id === id);
  }

  create(subject: Omit<Subject, 'id'>): Subject {
    const newSubject: Subject = { ...subject, id: `sub-${Date.now()}` };
    this.subjects.push(newSubject);
    save(STORAGE_KEYS.subjects, this.subjects);
    return newSubject;
  }

  update(id: string, data: Partial<Subject>): Subject | undefined {
    const idx = this.subjects.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    this.subjects[idx] = { ...this.subjects[idx], ...data };
    save(STORAGE_KEYS.subjects, this.subjects);
    return this.subjects[idx];
  }

  delete(id: string): boolean {
    const before = this.subjects.length;
    this.subjects = this.subjects.filter((s) => s.id !== id);
    save(STORAGE_KEYS.subjects, this.subjects);
    return this.subjects.length < before;
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

  create(todo: Omit<TodoTask, 'id' | 'createdAt' | 'uid'> & { uid?: string; id?: string; createdAt?: string }): TodoTask {
    const id = todo.id || `todo-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const newTodo: TodoTask = {
      ...todo,
      id,
      uid: todo.uid || `${id}@studycore`,
      createdAt: todo.createdAt || new Date().toISOString(),
    };
    this.todos.push(newTodo);
    save(STORAGE_KEYS.todos, this.todos);
    return newTodo;
  }

  update(id: string, data: Partial<TodoTask>): TodoTask | undefined {
    const idx = this.todos.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    this.todos[idx] = { ...this.todos[idx], ...data };
    save(STORAGE_KEYS.todos, this.todos);
    return this.todos[idx];
  }

  delete(id: string): boolean {
    const before = this.todos.length;
    this.todos = this.todos.filter((t) => t.id !== id);
    save(STORAGE_KEYS.todos, this.todos);
    return this.todos.length < before;
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

  create(event: Omit<CalendarEvent, 'id' | 'uid'> & { id?: string; uid?: string }): CalendarEvent {
    const id = event.id || String(Date.now());
    const newEvent: CalendarEvent = {
      ...event,
      id,
      uid: event.uid || `evt-${id}@studycore`,
    };
    this.events.push(newEvent);
    save(STORAGE_KEYS.events, this.events);
    return newEvent;
  }

  update(id: string, data: Partial<CalendarEvent>): CalendarEvent | undefined {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    this.events[idx] = { ...this.events[idx], ...data };
    save(STORAGE_KEYS.events, this.events);
    return this.events[idx];
  }

  delete(id: string): boolean {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    save(STORAGE_KEYS.events, this.events);
    return this.events.length < before;
  }

  replaceAll(events: CalendarEvent[]): void {
    this.events = events;
    save(STORAGE_KEYS.events, this.events);
  }
}

class SettingsRepository {
  private settings: UserSettings = load<UserSettings>(STORAGE_KEYS.settings, {
    dailyGoalMinutes: 360,
    theme: 'light',
    calDav: {
      serverUrl: '',
      username: '',
      password: '',
      calendar: 'default',
      connected: false,
      lastSync: null,
    },
  });

  get(): UserSettings {
    return { ...this.settings, calDav: { ...this.settings.calDav } };
  }

  update(data: Partial<UserSettings>): UserSettings {
    if (data.calDav) {
      this.settings.calDav = { ...this.settings.calDav, ...data.calDav };
    }
    if (data.dailyGoalMinutes !== undefined) {
      this.settings.dailyGoalMinutes = data.dailyGoalMinutes;
    }
    if (data.theme) {
      this.settings.theme = data.theme;
    }
    save(STORAGE_KEYS.settings, this.settings);
    return this.get();
  }
}

/**
 * Tombstones: UIDs of events deleted locally, so a full push never
 * re-uploads them and the deletion propagates to other devices.
 */
class TombstoneRepository {
  private uids: Set<string> = new Set(load<string[]>(STORAGE_KEYS.tombstones, []));

  getAll(): string[] {
    return [...this.uids];
  }

  add(uid: string): void {
    if (!uid) return;
    this.uids.add(uid);
    save(STORAGE_KEYS.tombstones, [...this.uids]);
  }

  has(uid: string): boolean {
    return this.uids.has(uid);
  }

  remove(uid: string): void {
    if (!this.uids.delete(uid)) return;
    save(STORAGE_KEYS.tombstones, [...this.uids]);
  }
}

export const subjectRepo = new SubjectRepository();
export const eventRepo = new EventRepository();
export const settingsRepo = new SettingsRepository();
export const tombstoneRepo = new TombstoneRepository();
export const todoRepo = new TodoRepository();
