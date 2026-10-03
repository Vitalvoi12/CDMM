import type { CalendarEvent, EventTimeEdit, TodoTask } from '../types';
import { countsTowardStats } from './stats';
import { addDays, addMonths, dateKey, endOfDay, startOfDay, startOfWeek } from './time';

/**
 * Statistics for the whole Statistics screen.
 *
 * Everything in here is derived from ONE period (`Period`) and from real focus
 * sessions only — the events Focus Room actually produced. Scheduled blocks
 * (kind 'plan') and the "count in stats" flag decide what counts; the numbers
 * never mix planned time in with studied time.
 *
 * The heavy lifting is `splitStudySlices`: an event that crosses midnight is
 * cut at local day boundaries, so the per-day, per-hour, per-subject and
 * per-bucket numbers can never disagree with each other.
 */

// ---- period ----

export type PeriodPreset = '7d' | '30d' | '3m' | 'year' | 'custom';

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '3m', label: '3 months' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

export interface Period {
  preset: PeriodPreset;
  from: Date;
  to: Date;
  /** Inclusive day count. */
  days: number;
  label: string;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayCount(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
}

function periodLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const a = from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const b = to.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  return dayCount(from, to) === 1 ? b : `${a} – ${b}`;
}

/** Resolve the selected preset into a concrete inclusive date range. */
export function resolvePeriod(
  preset: PeriodPreset,
  custom: { from: string; to: string },
  today = new Date()
): Period {
  const now = startOfDay(today);
  let from = now;
  let to = now;
  switch (preset) {
    case '7d':
      from = addDays(now, -6);
      break;
    case '30d':
      from = addDays(now, -29);
      break;
    case '3m':
      from = startOfDay(addMonths(now, -3));
      break;
    case 'year':
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 31);
      break;
    case 'custom': {
      const a = parseISODate(custom.from);
      const b = parseISODate(custom.to);
      from = a ?? addDays(now, -6);
      to = b ?? now;
      if (from.getTime() > to.getTime()) [from, to] = [to, from];
      break;
    }
  }
  return { preset, from, to, days: dayCount(from, to), label: periodLabel(from, to) };
}

// ---- focus slices ----

export interface FocusSlice {
  /** Local day the slice belongs to. */
  date: string;
  minutes: number;
  subjectId: string;
  /** Local hour (0-23) the slice starts at — drives the rhythm heatmap. */
  hour: number;
  /** True for the slice holding the session's own start, so it is counted once. */
  sessionStart: boolean;
}

/**
 * Cut every counted session at local hour boundaries (midnight included).
 *
 * A 10:15–12:40 block becomes 10:15–11:00, 11:00–12:00 and 12:00–12:40, so the
 * hourly rhythm attributes each minute to the hour it was actually spent in
 * while the per-day, per-subject and per-bucket totals stay unchanged — they
 * are sums over exactly the same minutes.
 */
export function splitStudySlices(events: CalendarEvent[]): FocusSlice[] {
  const slices: FocusSlice[] = [];
  for (const e of events) {
    if (!countsTowardStats(e)) continue;
    const startMs = new Date(e.start).getTime();
    const endMs = new Date(e.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    let cursor = startMs;
    let first = true;
    while (cursor < endMs) {
      const at = new Date(cursor);
      // Next local hour boundary — also the local day boundary at 00:00.
      const hourEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate(), at.getHours() + 1).getTime();
      const sliceEnd = Math.min(endMs, hourEnd);
      const minutes = Math.round((sliceEnd - cursor) / 60000);
      if (minutes > 0) {
        slices.push({
          date: dateKey(at),
          minutes,
          subjectId: e.subjectId,
          hour: at.getHours(),
          sessionStart: first,
        });
      }
      cursor = sliceEnd;
      first = false;
    }
  }
  return slices;
}

export interface StudyDay {
  date: string;
  minutes: number;
  sessions: number;
}

/** One entry per calendar day of the period, empty days included. */
export function buildDaySeries(slices: FocusSlice[], from: Date, to: Date): StudyDay[] {
  const byDate = new Map<string, { minutes: number; sessions: number }>();
  for (const s of slices) {
    const cur = byDate.get(s.date) || { minutes: 0, sessions: 0 };
    cur.minutes += s.minutes;
    if (s.sessionStart) cur.sessions += 1;
    byDate.set(s.date, cur);
  }
  const out: StudyDay[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    const key = dateKey(cursor);
    const hit = byDate.get(key);
    out.push({ date: key, minutes: hit?.minutes || 0, sessions: hit?.sessions || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ---- focus time chart ----

export type BucketSize = 'day' | 'week' | 'month';

export interface FocusBucket {
  key: string;
  /** Full label for the tooltip. */
  label: string;
  /** Ticked axis label. */
  short: string;
  minutes: number;
  sessions: number;
}

/** 7/30 days read as days, a quarter as weeks, anything longer as months. */
export function bucketSizeFor(preset: PeriodPreset, days: number): BucketSize {
  if (preset === '7d' || preset === '30d') return 'day';
  if (preset === '3m') return 'week';
  if (preset === 'year') return 'month';
  return days <= 45 ? 'day' : days <= 120 ? 'week' : 'month';
}

function bucketAnchor(d: Date, size: BucketSize): Date {
  if (size === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (size === 'week') return startOfWeek(d);
  return startOfDay(d);
}

function nextAnchor(d: Date, size: BucketSize): Date {
  if (size === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  if (size === 'week') return addDays(d, 7);
  return addDays(d, 1);
}

function bucketLabel(d: Date, size: BucketSize): { label: string; short: string } {
  if (size === 'month') {
    return {
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      short: d.toLocaleDateString('en-US', { month: 'short' }),
    };
  }
  if (size === 'week') {
    return {
      label: `Week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
      short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }
  return {
    label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

/** Group study time into day / week / month buckets, covering the whole period. */
export function buildFocusBuckets(
  days: StudyDay[],
  from: Date,
  to: Date,
  size: BucketSize
): FocusBucket[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: FocusBucket[] = [];
  const endTime = startOfDay(to).getTime();
  let cursor = bucketAnchor(from, size);
  while (cursor.getTime() <= endTime) {
    const next = nextAnchor(cursor, size);
    const { label, short } = bucketLabel(cursor, size);
    let minutes = 0;
    let sessions = 0;
    const slice = new Date(Math.max(cursor.getTime(), startOfDay(from).getTime()));
    while (slice.getTime() < next.getTime() && slice.getTime() <= endTime) {
      const hit = byDate.get(dateKey(slice));
      if (hit) {
        minutes += hit.minutes;
        sessions += hit.sessions;
      }
      slice.setDate(slice.getDate() + 1);
    }
    out.push({ key: dateKey(cursor), label, short, minutes, sessions });
    cursor = next;
  }
  return out;
}

// ---- when you study ----

/** Five-step intensity scale, shared by the rhythm heatmap and the calendar. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Fixed thresholds rather than relative ones: "two hours" should look the same
 * in a quiet week and in a busy one, otherwise the two views stop comparing.
 */
export function heatmapLevel(totalMinutes: number): HeatLevel {
  if (totalMinutes <= 0) return 0;
  if (totalMinutes <= 30) return 1;
  if (totalMinutes <= 60) return 2;
  if (totalMinutes <= 120) return 3;
  return 4;
}

export function heatmapCellClass(level: HeatLevel): string {
  return ['bg-heatmap-0', 'bg-heatmap-1', 'bg-heatmap-2', 'bg-heatmap-3', 'bg-heatmap-4'][level];
}

/** One row per hour of the day; the columns are the seven weekdays. */
export const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface RhythmCell {
  minutes: number;
  sessions: number;
}

export interface Rhythm {
  /** [weekday 0 = Monday][hour 0-23] */
  cells: RhythmCell[][];
  maxMinutes: number;
  totalMinutes: number;
  /** Busiest (weekday, hour), if anything was studied at all. */
  peak: { weekday: number; hour: number; minutes: number } | null;
}

export function buildRhythm(slices: FocusSlice[]): Rhythm {
  const cells: RhythmCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ minutes: 0, sessions: 0 }))
  );
  let maxMinutes = 0;
  let totalMinutes = 0;
  let peak: Rhythm['peak'] = null;
  for (const s of slices) {
    const d = new Date(`${s.date}T00:00:00`);
    const weekday = (d.getDay() + 6) % 7;
    const cell = cells[weekday][Math.min(23, Math.max(0, s.hour))];
    cell.minutes += s.minutes;
    if (s.sessionStart) cell.sessions += 1;
    totalMinutes += s.minutes;
    if (cell.minutes > maxMinutes) maxMinutes = cell.minutes;
    if (!peak || cell.minutes > peak.minutes) peak = { weekday, hour: s.hour, minutes: cell.minutes };
  }
  return { cells, maxMinutes, totalMinutes, peak };
}

/** "18:00–19:00" — the label of one row of the rhythm grid. */
export function hourRange(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;
}

/** Relative intensity for a rhythm cell, in four steps past empty. */
export function rhythmLevel(minutes: number, maxMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || maxMinutes <= 0) return 0;
  const ratio = minutes / maxMinutes;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

// ---- consistency ----

export interface ConsistencyStats {
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  /** Share of the period that saw at least one session. */
  activeShare: number;
}

/**
 * Regularity, read from the period's own day list. The current streak walks
 * back from today (yesterday counts as still alive when today has not started
 * yet) so it stays meaningful while the selected period is a past window.
 */
export function calculateConsistency(days: StudyDay[]): ConsistencyStats {
  let activeDays = 0;
  let streak = 0;
  let longestStreak = 0;
  const active = new Set<string>();
  for (const d of days) {
    if (d.minutes > 0) {
      activeDays++;
      active.add(d.date);
      streak++;
      if (streak > longestStreak) longestStreak = streak;
    } else {
      streak = 0;
    }
  }

  const today = dateKey(new Date());
  const yesterday = dateKey(addDays(new Date(), -1));
  let currentStreak = 0;
  let cursor = active.has(today) ? today : active.has(yesterday) ? yesterday : null;
  while (cursor && active.has(cursor)) {
    currentStreak++;
    const d = parseISODate(cursor);
    if (!d) break;
    cursor = dateKey(addDays(d, -1));
  }

  return {
    activeDays,
    currentStreak,
    longestStreak,
    activeShare: days.length > 0 ? activeDays / days.length : 0,
  };
}

// ---- tasks ----

export interface TaskSubjectStat {
  subjectId: string;
  completed: number;
  total: number;
}

export interface TaskStats {
  /** Tasks created inside the period — the cohort every other figure describes. */
  created: number;
  /** Finished inside the period (by completion time). */
  completed: number;
  /** Share of the cohort that is done. */
  completionRate: number;
  stillOpen: number;
  /** Open tasks of the cohort whose deadline has passed. */
  overdue: number;
  onTime: number;
  late: number;
  /** Completed inside the period that had a deadline at all. */
  withDeadline: number;
  bySubject: TaskSubjectStat[];
}

export function calculateTaskStats(todos: TodoTask[], from: Date, to: Date): TaskStats {
  const start = startOfDay(from).getTime();
  const end = endOfDay(to).getTime();
  const now = Date.now();
  const cohort = todos.filter((t) => {
    const ms = new Date(t.createdAt).getTime();
    return Number.isFinite(ms) && ms >= start && ms <= end;
  });

  let completed = 0;
  let stillOpen = 0;
  let overdue = 0;
  let onTime = 0;
  let late = 0;
  let withDeadline = 0;
  const perSubject = new Map<string, { completed: number; total: number }>();

  for (const t of cohort) {
    const key = t.subjectId || '';
    const row = perSubject.get(key) || { completed: 0, total: 0 };
    row.total += 1;
    perSubject.set(key, row);

    const doneAt = t.completedAt ? new Date(t.completedAt).getTime() : NaN;
    if (t.completed && Number.isFinite(doneAt) && doneAt >= start && doneAt <= end) {
      completed++;
      row.completed += 1;
      if (t.dueDate) {
        withDeadline++;
        if (doneAt <= new Date(t.dueDate).getTime()) onTime++;
        else late++;
      }
    }
    if (!t.completed) {
      stillOpen++;
      if (t.dueDate && new Date(t.dueDate).getTime() < now) overdue++;
    }
  }

  const bySubject = [...perSubject.entries()]
    .map(([subjectId, v]) => ({ subjectId, ...v }))
    .sort((a, b) => b.total - a.total || b.completed - a.completed);

  return {
    created: cohort.length,
    completed,
    completionRate: cohort.length > 0 ? (cohort.length - stillOpen) / cohort.length : 0,
    stillOpen,
    overdue,
    onTime,
    late,
    withDeadline,
    bySubject,
  };
}

// ---- plan stability ----

export interface PlanStabilityEvent {
  eventId: string;
  title: string;
  subjectId: string;
  /** Planned time this block gave up, in minutes. */
  lostMinutes: number;
  lastAt: number;
}

export interface PlanStabilitySubject {
  subjectId: string;
  lostMinutes: number;
}

export interface PlanStability {
  /** Planned minutes the period started with, before any correction. */
  plannedMinutes: number;
  /** Planned minutes the corrections gave up. */
  lostMinutes: number;
  /** 100 = the plan kept its length, 0 = every planned minute was cut away. */
  stability: number;
  /** Blocks that lost the most planned time, heaviest first. */
  top: PlanStabilityEvent[];
  bySubject: PlanStabilitySubject[];
  /** Oldest tracked change, to explain how far back the log reaches. */
  trackedSince: number | null;
}

function overlapsPeriod(e: CalendarEvent, from: Date, to: Date): boolean {
  const s = new Date(e.start).getTime();
  const en = new Date(e.end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(en)) return false;
  return s < endOfDay(to).getTime() && en > startOfDay(from).getTime();
}

function durationMinutes(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : 0;
}

/**
 * How much of the plan survived its own corrections.
 *
 * Stability is measured in planned TIME: every correction that makes a block
 * shorter takes minutes out of the plan, and those losses are summed per
 * subject and then across all subjects. A block that is merely moved to another
 * hour loses nothing, and a block that is made longer never counts against
 * stability — which is why nothing here is measured in clicks.
 *
 * Only planned blocks count, and only ones included in statistics — swapping
 * the tasks inside a block, retitling it, re-colouring it or excluding it from
 * stats leaves the plan's length untouched, so none of that shows up here. A
 * finished focus session is not part of the plan at all.
 */
export function calculatePlanStability(
  edits: EventTimeEdit[],
  events: CalendarEvent[],
  from: Date,
  to: Date
): PlanStability {
  const start = startOfDay(from).getTime();
  const end = endOfDay(to).getTime();
  const live = new Map(events.map((e) => [e.id, e]));
  const inPeriod = edits.filter((ed) => {
    if (ed.kind !== 'plan' || ed.countInStats === false) return false;
    if (ed.at < start || ed.at > end) return false;
    // A block excluded from stats after the fact stops counting too.
    const now = live.get(ed.eventId);
    return !now || now.countInStats !== false;
  });
  const trackedSince = edits.length > 0 ? Math.min(...edits.map((e) => e.at)) : null;

  const scheduled = new Set<string>();
  for (const e of events) {
    if ((e.kind ?? 'real') === 'plan' && e.countInStats !== false && overlapsPeriod(e, from, to)) {
      scheduled.add(e.id);
    }
  }
  // A block that was rescheduled and then deleted still belongs to the period.
  for (const ed of inPeriod) scheduled.add(ed.eventId);

  const byEvent = new Map<string, PlanStabilityEvent>();
  /** A block's length before its FIRST recorded change — its original plan. */
  const originalMinutes = new Map<string, number>();
  let lostMinutes = 0;
  const lostBySubject = new Map<string, number>();

  for (const ed of inPeriod) {
    const before = durationMinutes(ed.fromStart, ed.fromEnd);
    const after = durationMinutes(ed.toStart, ed.toEnd);
    const loss = Math.max(0, before - after);
    if (!originalMinutes.has(ed.eventId)) originalMinutes.set(ed.eventId, before);
    if (loss <= 0) continue;

    const row =
      byEvent.get(ed.eventId) ||
      ({
        eventId: ed.eventId,
        title: ed.title,
        subjectId: ed.subjectId,
        lostMinutes: 0,
        lastAt: 0,
      } satisfies PlanStabilityEvent);
    row.lostMinutes += loss;
    row.lastAt = Math.max(row.lastAt, ed.at);
    byEvent.set(ed.eventId, row);

    lostMinutes += loss;
    lostBySubject.set(ed.subjectId, (lostBySubject.get(ed.subjectId) || 0) + loss);
  }

  // The plan the period started with: every scheduled block at its original
  // length where we know it, otherwise at the length it still has today.
  let plannedMinutes = 0;
  for (const id of scheduled) {
    const event = live.get(id);
    const original = originalMinutes.get(id);
    if (original !== undefined) plannedMinutes += original;
    else if (event) plannedMinutes += durationMinutes(event.start, event.end);
  }

  const stability =
    plannedMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((1 - lostMinutes / plannedMinutes) * 100)))
      : lostMinutes > 0
        ? 0
        : 100;

  return {
    plannedMinutes,
    lostMinutes,
    stability,
    bySubject: [...lostBySubject.entries()]
      .map(([subjectId, minutes]) => ({ subjectId, lostMinutes: minutes }))
      .sort((a, b) => b.lostMinutes - a.lostMinutes),
    top: [...byEvent.values()].sort((a, b) => b.lostMinutes - a.lostMinutes || b.lastAt - a.lastAt),
    trackedSince,
  };
}
