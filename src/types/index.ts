export interface Subject {
  id: string;
  name: string;
  color: string;
  icon?: string;
  modules?: number;
  progress?: number;
  /**
   * Weekly study goal in minutes ("Linear Algebra — 6 h/week"). Progress is
   * real focus time in the Monday–Sunday week. Absent = no goal; null is sent
   * to the server to clear it.
   */
  weeklyGoalMinutes?: number | null;
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
   * Legacy per-event mini tasks. No longer edited: on sync they are moved
   * into the day's checklist (see DayTaskList) and cleared here. Kept so
   * records written by older clients still migrate.
   */
  checklist?: EventChecklistItem[];
  /**
   * Reminder lead time in minutes before `start`; 0 = at the start.
   * Absent/null = no reminder. null is sent to the server to clear it.
   */
  notifyBefore?: number | null;
  /**
   * Further reminders, as more leads in minutes before `start`. Only used
   * alongside `notifyBefore`. Absent/empty = none; [] is sent to clear it.
   */
  notifyExtra?: number[];
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
  /**
   * Focus quality of a finished session, rated right after Finish:
   * 1 = scattered, 2 = okay, 3 = deep. Real events only. Absent = not rated;
   * null is sent to the server to clear it.
   */
  focus?: 1 | 2 | 3 | null;
  /**
   * Checklist or todo task this planned block was dragged from. Lets the
   * checklist show when the task is scheduled. Absent = not from a task.
   */
  taskId?: string;
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
   * True when the user picked a time for `dueDate`. Otherwise the stored time
   * is a fixed 18:00 placeholder and only the day is shown.
   */
  dueHasTime?: boolean;
  /**
   * Estimated time to complete, in minutes. Absent = not estimated.
   * Purely advisory: nothing is scheduled from it.
   */
  estMinutes?: number;
  completed: boolean;
  /**
   * ISO time the task was last ticked off. Stamped by the repository on the
   * completed false → true transition and cleared when it is reopened, so
   * deadline statistics never depend on a later title or urgency edit.
   * Absent while the task is open.
   */
  completedAt?: string;
  /**
   * Reminder notifications, skipped once the task is completed. `at` is the
   * moment it fires (what the schedulers read); `lead` is set when it was
   * picked as minutes before the due time (9:00 on the due day without a
   * time), so the editor can show that choice again. Absent/empty = none.
   */
  reminders?: TodoReminder[];
  createdAt: string;
  /** Last local modification, ms epoch. Used for last-write-wins sync. */
  updatedAt: number;
}

export interface TodoReminder {
  at: string;
  lead?: number;
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
  /** '' for a custom session, which carries its own title and color instead. */
  subjectId: string;
  /** Custom (subject-less) session name. */
  title?: string;
  /** Custom (subject-less) session color. */
  color?: string;
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
  /** How the Android phone signals reminders and block edges. */
  signals?: DeviceSignalSettings;
  /** LWW clock for `signals`, so a theme change elsewhere can't undo a choice. */
  signalsAt?: number;
}

/** What a device does for one kind of signal. */
export type SignalMode = 'off' | 'vibrate' | 'sound' | 'both';
/**
 * reminder = an event's own reminders, start/end = any event beginning or
 * ending, todo = task reminders.
 */
export type SignalKind = 'reminder' | 'start' | 'end' | 'todo';
export type VibrationPattern = 'short' | 'long' | 'double' | 'triple';
export type SignalDevice = 'phone';

export type DeviceSignals = Record<SignalKind, SignalMode> & { pattern: VibrationPattern };

export type DeviceSignalSettings = Record<SignalDevice, DeviceSignals>;

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

/** One item of a day's checklist. */
export interface DayTask {
  id: string;
  text: string;
  done: boolean;
  /** Subject it is grouped under, or '' for none. */
  subjectId: string;
  /**
   * Rough time the task takes, in minutes. Absent = not estimated. Becomes the
   * length of the planned block when the task is dragged onto the timeline.
   */
  estMinutes?: number;
}

/**
 * The Checklist of one calendar day, independent of the day's events. `id` is
 * the local date key ("YYYY-MM-DD"); like day notes the record is never
 * deleted — removing the last task stores an empty list.
 */
export interface DayTaskList {
  id: string;
  tasks: DayTask[];
  updatedAt: number;
}
