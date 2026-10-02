export interface Subject {
  id: string;
  name: string;
  color: string;
  icon?: string;
  modules?: number;
  progress?: number;
  /** Last local modification, ms epoch. Used for last-write-wins sync. */
  updatedAt: number;
}

export interface CalendarEvent {
  id: string;
  uid: string;
  /**
   * Subject id, or '' for custom plan events not tied to any subject.
   * Only plan events may be subject-less; real events always have one.
   */
  subjectId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  /** 'real' (default) | 'plan'. undefined = 'real' for backward compat. */
  kind?: 'real' | 'plan';
  /**
   * Whether the event counts toward statistics (focus time totals, focus
   * room, plan progress, heatmaps). Absent/undefined = true for backward
   * compat. Plan events never count regardless of this flag.
   */
  countInStats?: boolean;
  /**
   * Custom plan-event color (subject-less events only; subject-bound events
   * always use their subject's color). Absent = default gray.
   */
  color?: string;
  /**
   * Shared id linking occurrences of one repeating series.
   * Absent/null = standalone event. null is sent to the server to clear it.
   */
  recurrenceId?: string | null;
  /** Last local modification, ms epoch. Used for last-write-wins sync. */
  updatedAt: number;
}

export interface StudySession {
  id: string;
  subjectId: string;
  start: string;
  end: string | null;
  isActive: boolean;
}

export interface DailyStatistics {
  date: string;
  totalMinutes: number;
  sessionCount: number;
  subjectMinutes: Record<string, number>;
  currentEvent: CalendarEvent | null;
  nextEvent: CalendarEvent | null;
}

export interface WeeklyStatistics {
  weekStart: string;
  weekEnd: string;
  totalMinutes: number;
  dailyMinutes: number[];
  dailyAverage: number;
  subjectMinutes: Record<string, number>;
  mostStudiedSubject: { subjectId: string; minutes: number } | null;
}

export type ThemeMode = 'light' | 'dark';

export interface TodoTask {
  id: string;
  uid: string;
  title: string;
  description?: string;
  important: boolean;
  urgent: boolean;
  dueDate?: string;
  /**
   * Estimated time to complete, in minutes. Absent = not estimated.
   * Purely advisory: nothing is scheduled from it.
   */
  estMinutes?: number;
  completed: boolean;
  createdAt: string;
  /** Last local modification, ms epoch. Used for last-write-wins sync. */
  updatedAt: number;
}

/**
 * The running study session, stored in the synced settings blob.
 *
 * There is exactly one live session per account, so any device can start it,
 * see it and end it. `id` doubles as the id of the event that closing the
 * session creates — two devices pressing Finish at the same time therefore
 * produce one event, not two.
 */
export interface SyncedSession {
  id: string;
  subjectId: string;
  /** Wall-clock start. Never moved, so the calendar block stays where it is. */
  start: string;
  /** ISO time the user hit pause, or null while running. */
  pausedAt: string | null;
  /** Focus ms banked before the current pause/resume stretch. */
  bankedMs: number;
  /**
   * Timestamp of the last mutation. The session is a field inside the single
   * synced settings record, so it needs its own clock for last-write-wins —
   * otherwise a theme change on another device would clobber it.
   */
  updatedAt: number;
}

export interface UserSettings {
  theme: ThemeMode;
  /** Live session, or null when idle. */
  activeSession?: SyncedSession | null;
  /**
   * LWW clock for `activeSession`, bumped on every write INCLUDING clearing it
   * — a bare `null` carries no timestamp of its own, so the clock has to live
   * beside it or an ended session could be resurrected by a stale push.
   */
  activeSessionAt?: number;
}

export type CalendarView = 'day' | '3day' | 'week' | 'month' | 'year';

/** Timeline event-kind filter: 'all' renders Real|Plan side by side. */
export type EventFilter = 'real' | 'plan' | 'all';
