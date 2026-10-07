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
    Array.from({ length: 24 }, () => ({ minutes: 0 }))
  );
  let maxMinutes = 0;
  let totalMinutes = 0;
  let peak: Rhythm['peak'] = null;
  for (const s of slices) {
    const d = new Date(`${s.date}T00:00:00`);
    const weekday = (d.getDay() + 6) % 7;
    const hour = Math.min(23, Math.max(0, s.hour));
    // Time only: a 40-minute and a 3-hour session both weigh what they cost.
    const cell = cells[weekday][hour];
    cell.minutes += s.minutes;
    totalMinutes += s.minutes;
    if (cell.minutes > maxMinutes) maxMinutes = cell.minutes;
    if (!peak || cell.minutes > peak.minutes) peak = { weekday, hour, minutes: cell.minutes };
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

  for (const t of cohort) {
    const doneAt = t.completedAt ? new Date(t.completedAt).getTime() : NaN;
    if (t.completed && Number.isFinite(doneAt) && doneAt >= start && doneAt <= end) {
      completed++;
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

  return {
    created: cohort.length,
    completed,
    completionRate: cohort.length > 0 ? (cohort.length - stillOpen) / cohort.length : 0,
    stillOpen,
    overdue,
    onTime,
    late,
    withDeadline,
  };
}

// ---- plan stability ----

export interface PlanStabilityEvent {
  eventId: string;
  title: string;
  subjectId: string;
  /** Planned time this block gave up, in minutes. */
  lostMinutes: number;
  /** The block was removed outright rather than shortened. */
  deleted: boolean;
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
 * How long a freshly created block is given before its corrections count.
 *
 * Right after creating a block people nudge it — a few minutes later they fix
 * the hour they mis-typed. Those edits are part of making the plan, not a sign
 * of an unstable one, so the first ten minutes are ignored. Everything else
 * about the event (statistics, sync, the calendar) behaves exactly as before.
 */
export const PLAN_FIX_WINDOW_MS = 10 * 60 * 1000;

/** One block's fixed length and everything it gave up after being fixed. */
interface PlanStabilityWalk {
  eventId: string;
  subjectId: string;
  title: string;
  deleted: boolean;
  fixedMinutes: number;
  lostMinutes: number;
  lastAt: number;
}

/**
 * True once a change is far enough from its block's creation to be a real
 * correction. Events created before the stamp existed — and events that have
 * since been deleted, where the creation time is simply unknown — are never
 * inside a grace period, so their history keeps counting as it did.
 */
function isPastFixWindow(
  eventId: string,
  at: number,
  live: Map<string, CalendarEvent>
): boolean {
  const created = live.get(eventId)?.createdAt;
  if (!created) return true;
  const createdMs = new Date(created).getTime();
  if (!Number.isFinite(createdMs)) return true;
  return at >= createdMs + PLAN_FIX_WINDOW_MS;
}

/**
 * How much of the plan survived its own corrections.
 *
 * Every planned block gets its length FIXED ten minutes after it is created —
 * that is the plan this metric holds it to. From then on two things cost it:
 * shortening the block, and deleting it (which costs everything it still held).
 * Moving it to another hour costs nothing, and making it longer never helps
 * either. Losses are summed per subject and then across all subjects, so the
 * percentage is a share of planned time, not a count of edits.
 *
 * Nothing inside the first ten minutes counts: whatever the block looks like
 * when the clock runs out is simply what it was planned to be. Events created
 * before this stamp existed — and events that have since been deleted, whose
 * creation time is unknowable — are treated as fixed already.
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
  const eligible = edits
    .filter((ed) => {
      if (ed.kind !== 'plan' || ed.countInStats === false) return false;
      if (ed.at < start || ed.at > end) return false;
      // A block excluded from stats after the fact stops counting too.
      const now = live.get(ed.eventId);
      if (now && now.countInStats === false) return false;
      return isPastFixWindow(ed.eventId, ed.at, live);
    })
    .sort((a, b) => a.at - b.at);
  const trackedSince = edits.length > 0 ? Math.min(...edits.map((e) => e.at)) : null;

  // Walk each block's own history: its first eligible entry is the length it
  // was fixed with, and every entry after that moves that length.
  const walks = new Map<string, PlanStabilityWalk>();
  for (const ed of eligible) {
    const before = durationMinutes(ed.fromStart, ed.fromEnd);
    const after = durationMinutes(ed.toStart, ed.toEnd);
    // Removing a fixed block costs everything it still held; shortening it
    // costs only what the shortening actually took away.
    const loss = ed.deleted ? before : Math.max(0, before - after);
    const walk = walks.get(ed.eventId);
    if (walk) {
      walk.lostMinutes += loss;
      walk.deleted = walk.deleted || !!ed.deleted;
      walk.lastAt = Math.max(walk.lastAt, ed.at);
    } else {
      walks.set(ed.eventId, {
        eventId: ed.eventId,
        subjectId: ed.subjectId,
        title: ed.title,
        deleted: !!ed.deleted,
        fixedMinutes: before,
        lostMinutes: loss,
        lastAt: ed.at,
      });
    }
  }

  let plannedMinutes = 0;
  let lostMinutes = 0;
  const lostBySubject = new Map<string, number>();
  const top: PlanStabilityEvent[] = [];
  for (const walk of walks.values()) {
    plannedMinutes += walk.fixedMinutes;
    // A block can never give up more than it was fixed with: growing it and
    // then cutting it back must not book a loss larger than the plan itself.
    const lost = Math.min(walk.lostMinutes, walk.fixedMinutes);
    if (lost <= 0) continue;
    lostMinutes += lost;
    lostBySubject.set(walk.subjectId, (lostBySubject.get(walk.subjectId) || 0) + lost);
    top.push({
      eventId: walk.eventId,
      title: walk.title,
      subjectId: walk.subjectId,
      deleted: walk.deleted,
      lostMinutes: lost,
      lastAt: walk.lastAt,
    });
  }
  top.sort((a, b) => b.lostMinutes - a.lostMinutes || b.lastAt - a.lastAt);

  // Blocks nobody ever touched still belong to the plan, at the length they
  // stand at today.
  for (const e of events) {
    if ((e.kind ?? 'real') !== 'plan' || e.countInStats === false) continue;
    if (walks.has(e.id) || !overlapsPeriod(e, from, to)) continue;
    plannedMinutes += durationMinutes(e.start, e.end);
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
    top,
    trackedSince,
  };
}
