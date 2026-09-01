import type { Subject, CalendarEvent, UserSettings } from '../types';
import { mockSubjects, mockEvents, mockSettings } from './mockData';

class SubjectRepository {
  private subjects: Subject[] = [...mockSubjects];

  getAll(): Subject[] {
    return [...this.subjects];
  }

  getById(id: string): Subject | undefined {
    return this.subjects.find((s) => s.id === id);
  }

  create(subject: Omit<Subject, 'id'>): Subject {
    const newSubject: Subject = { ...subject, id: `sub-${Date.now()}` };
    this.subjects.push(newSubject);
    return newSubject;
  }

  update(id: string, data: Partial<Subject>): Subject | undefined {
    const idx = this.subjects.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    this.subjects[idx] = { ...this.subjects[idx], ...data };
    return this.subjects[idx];
  }

  delete(id: string): boolean {
    const before = this.subjects.length;
    this.subjects = this.subjects.filter((s) => s.id !== id);
    return this.subjects.length < before;
  }
}

class EventRepository {
  private events: CalendarEvent[] = [...mockEvents];

  getAll(): CalendarEvent[] {
    return [...this.events];
  }

  getById(id: string): CalendarEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  create(event: Omit<CalendarEvent, 'id' | 'uid'>): CalendarEvent {
    const id = String(Date.now());
    const newEvent: CalendarEvent = {
      ...event,
      id,
      uid: `evt-${id}@studycore`,
    };
    this.events.push(newEvent);
    return newEvent;
  }

  update(id: string, data: Partial<CalendarEvent>): CalendarEvent | undefined {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    this.events[idx] = { ...this.events[idx], ...data };
    return this.events[idx];
  }

  delete(id: string): boolean {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    return this.events.length < before;
  }
}

class SettingsRepository {
  private settings: UserSettings = { ...mockSettings };

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
    return this.get();
  }
}

export const subjectRepo = new SubjectRepository();
export const eventRepo = new EventRepository();
export const settingsRepo = new SettingsRepository();
