export interface Subject {
  id: string;
  name: string;
  color: string;
  icon?: string;
  modules?: number;
  progress?: number;
}

export interface EventContentSnapshot {
  title: string;
  description?: string;
  start: string;
  end: string;
  subjectId: string;
}

export interface CalendarEvent {
  id: string;
  uid: string;
  subjectId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  href?: string;
  etag?: string;
  /** Fields as they were the last time this copy was pushed to the server. */
  pushed?: EventContentSnapshot;
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
  href?: string;
  etag?: string;
}

export interface UserSettings {
  dailyGoalMinutes: number;
  theme: ThemeMode;
  calDav: {
    serverUrl: string;
    username: string;
    password: string;
    calendar: string;
    connected: boolean;
    lastSync: string | null;
  };
}

export type CalendarView = 'day' | '3day' | 'week' | 'month' | 'year';
