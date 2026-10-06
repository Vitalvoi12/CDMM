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

export interface EventChecklistItem {
  id: string;
  text: string;
  done: boolean;
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
  /**
   * Per-event mini tasks, edited in the event editor and aggregated by
   * subject in the calendar day panel. Absent = none (backward compat).
   * Travels inside the synced record, so all devices see the same list.
   */
  checklist?: EventChecklistItem[];
  /**
   * ISO time the event was first written. Absent on events created before this
   * field existed (and on imported ones that predate it).
   *
   * Used by plan stability to give a freshly created block a short grace period
   * before its corrections start counting — the seconds spent fixing a typo in
   * the slot you just made are not a sign of an unstable plan. Nothing else
   * reads it: statistics and sync are unaffected.
   */
  createdAt?: string;
  /** Last local modification, ms epoch. Used for last-write-wins sync. */
  updatedAt: number;
}

/**
 * One recorded change of an event's slot in the calendar.
 *
 * Written only for changes that move an event in time (a different start, end
 * or duration) — never for content edits such as a new task inside the block,
 * a retitle or a colour change. Feeds the "plan stability" statistics: the
 * fewer of these a period collects, the closer the calendar stayed to the
 * schedule it was built with.
 *
 * The title/subject/kind are snapshots taken at the moment of the change, so
 * an entry stays readable even after the event itself is deleted.
 */
export interface EventTimeEdit {
  id: string;
  /** Event whose time changed. */
  eventId: string;
  /** ms epoch of the change itself — this is the date the edit counts under. */
  at: number;
  fromStart: string;
  fromEnd: string;
  toStart: string;
  toEnd: string;
  title: string;
  subjectId: string;
  kind: 'real' | 'plan';
  /**
   * The event's "count in stats" flag at the moment of the change. Snapshotted
   * like the rest, so a block that was later excluded stops counting towards
   * plan stability even after it has been deleted.
   */
  countInStats?: boolean;
  /**
   * The block was deleted rather than moved. Its `from*` still carries the
   * length it held, which is the loss plan stability counts — without such an
   * entry a deleted block would leave no trace of how much plan went with it.
   */
  deleted?: boolean;
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
  /**
   * Subject the task belongs to, or absent when it is not tied to one.
   * Purely for grouping (subject statistics); the quadrants ignore it.
   */
  subjectId?: string;
  /**
   * ISO time the task was last ticked off. Stamped by the repository on the
   * completed false → true transition and cleared when it is reopened, so
   * deadline statistics never depend on a later title or urgency edit.
   * Absent while the task is open.
   */
  completedAt?: string;
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
  /**
   * Wall-clock start, and the only clock the focus time is derived from:
   * elapsed = now - start, unconditionally.
   *
   * Movable while the session runs, to count work that began before tracking
   * did. There is no pause: a session either counts or it is finished, so a
   * forgotten start is corrected by moving `start` rather than by banking
   * paused minutes.
   */
  start: string;
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

/**
 * Free-form markdown note for one calendar day. `id` is the local date key
 * ("YYYY-MM-DD"), so there is at most one note per day. A cleared note is kept
 * as empty content rather than deleted, so the clearing syncs like any edit.
 */
export interface DayNote {
  id: string;
  content: string;
  updatedAt: number;
}
