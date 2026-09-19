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
  completed: boolean;
  createdAt: string;
  /** Last local modification, ms epoch. Used for last-write-wins sync. */
  updatedAt: number;
}

export interface UserSettings {
  dailyGoalMinutes: number;
  theme: ThemeMode;
}

export type CalendarView = 'day' | '3day' | 'week' | 'month' | 'year';

/** Timeline event-kind filter: 'all' renders Real|Plan side by side. */
export type EventFilter = 'real' | 'plan' | 'all';
