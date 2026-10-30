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

/** Weeks the desktop activity grid shows when the period is shorter. */
export const HISTORY_WEEKS = 26;
/** The grid never grows past a year of columns. */
export const HISTORY_MAX_WEEKS = 53;

export interface ActivityHistory {
  /** Monday-first, whole weeks: `weeks × 7` days, future days included. */
  days: StudyDay[];
  weeks: number;
  /** Minutes of every active past day in `days`, ascending — the shade scale. */
  activeMinutes: number[];
  /** Days in a row up to today (or yesterday), over the whole history. */
  currentStreak: number;
  /** Longest run inside the visible weeks, with its first and last day. */
  longest: { length: number; from: string; to: string } | null;
}

/**
 * The desktop Consistency grid: whole weeks ending with the current one (or
 * with the period's last week, if that is later), at least HISTORY_WEEKS and
 * as many as the period needs, capped at HISTORY_MAX_WEEKS. Unlike
 * calculateConsistency, the current streak is not clipped to the period — a
 * 7-day window would otherwise never show more than 7.
 */
export function buildActivityHistory(slices: FocusSlice[], period: Period, today = new Date()): ActivityHistory {
  const now = startOfDay(today);
  const lastWeek = startOfWeek(period.to.getTime() > now.getTime() ? period.to : now);
  const periodWeeks = Math.round((lastWeek.getTime() - startOfWeek(period.from).getTime()) / (7 * 86400000)) + 1;
  const weeks = Math.min(HISTORY_MAX_WEEKS, Math.max(HISTORY_WEEKS, periodWeeks));
  const from = addDays(lastWeek, -(weeks - 1) * 7);
  const days = buildDaySeries(slices, from, addDays(lastWeek, 6));

  const todayKey = dateKey(now);
  const past = days.filter((d) => d.date <= todayKey);
  const activeMinutes = past.filter((d) => d.minutes > 0).map((d) => d.minutes).sort((a, b) => a - b);

  let longest: ActivityHistory['longest'] = null;
  let runStart = 0;
  past.forEach((d, i) => {
    if (d.minutes <= 0) {
      runStart = i + 1;
      return;
    }
    const length = i - runStart + 1;
    if (!longest || length > longest.length) longest = { length, from: past[runStart].date, to: d.date };
  });

  const active = new Set(slices.filter((s) => s.minutes > 0).map((s) => s.date));
  let cursor = active.has(todayKey) ? now : addDays(now, -1);
  let currentStreak = 0;
  while (active.has(dateKey(cursor))) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  return { days, weeks, activeMinutes, currentStreak, longest };
}

/**
 * Shade of one day against the person's own spread: the quartile of its rank
 * among the active days (ties rank up), so a 3-hour habit does not paint the
 * whole grid in the top colour the way fixed 30/60/120 thresholds would.
 */
export function historyLevel(minutes: number, activeMinutes: number[]): HeatLevel {
  if (minutes <= 0 || activeMinutes.length === 0) return 0;
  let atOrBelow = 0;
  while (atOrBelow < activeMinutes.length && activeMinutes[atOrBelow] <= minutes) atOrBelow++;
  return Math.max(1, Math.ceil((atOrBelow / activeMinutes.length) * 4)) as HeatLevel;
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

// ---- focus quality ----

export type FocusRating = 1 | 2 | 3;

export const FOCUS_LABELS: Record<FocusRating, string> = {
  1: 'Scattered',
  2: 'Okay',
  3: 'Deep',
};

export interface FocusGroup {
  label: string;
  /** Rated sessions in the group. */
  count: number;
  /** Mean rating 1-3, or null when the group has no rated session. */
  average: number | null;
}

export interface FocusQuality {
  /** Real, counted sessions that started in the period. */
  sessions: number;
  rated: number;
  average: number | null;
  /** How many sessions got each rating. */
  distribution: Record<FocusRating, number>;
  byTimeOfDay: FocusGroup[];
  byWeekday: FocusGroup[];
  byLength: FocusGroup[];
  /**
   * The best-rated group across all three splits, or null while too few
   * sessions are rated to say anything (each candidate needs MIN_FOCUS_SAMPLE).
   */
  best: { dimension: 'time' | 'weekday' | 'length'; group: FocusGroup } | null;
}

/** A group needs this many rated sessions before it can be called "best". */
export const MIN_FOCUS_SAMPLE = 3;

const TIME_OF_DAY: { label: string; from: number; to: number }[] = [
  { label: 'Early', from: 5, to: 9 },
  { label: 'Morning', from: 9, to: 12 },
  { label: 'Afternoon', from: 12, to: 17 },
  { label: 'Evening', from: 17, to: 21 },
  { label: 'Night', from: 21, to: 29 },
];

const LENGTHS: { label: string; max: number }[] = [
  { label: '< 30m', max: 30 },
  { label: '30–60m', max: 60 },
  { label: '1–1.5h', max: 90 },
  { label: '1.5h+', max: Infinity },
];

/**
 * When the user actually works best: the focus ratings given after Finish,
 * averaged by the hour the session started, its weekday and its length.
 * A session belongs to the day and hour it started in — a rating describes the
 * whole sitting, so it is not sliced at midnight like focus minutes are.
 */
export function calculateFocusQuality(events: CalendarEvent[], from: Date, to: Date): FocusQuality {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();
  const tod = TIME_OF_DAY.map(() => ({ sum: 0, count: 0 }));
  const wd = WEEKDAY_LABELS.map(() => ({ sum: 0, count: 0 }));
  const len = LENGTHS.map(() => ({ sum: 0, count: 0 }));
  const distribution: Record<FocusRating, number> = { 1: 0, 2: 0, 3: 0 };
  let sessions = 0;
  let rated = 0;
  let sum = 0;

  for (const e of events) {
    if (!countsTowardStats(e)) continue;
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(en) || s < fromMs || s > toMs) continue;
    sessions++;
    const r = e.focus;
    if (r !== 1 && r !== 2 && r !== 3) continue;
    rated++;
    sum += r;
    distribution[r]++;
    const at = new Date(s);
    // Hours after midnight belong to the night that started the evening before.
    const hour = at.getHours() < 5 ? at.getHours() + 24 : at.getHours();
    const t = TIME_OF_DAY.findIndex((b) => hour >= b.from && hour < b.to);
    if (t !== -1) {
      tod[t].sum += r;
      tod[t].count++;
    }
    const w = (at.getDay() + 6) % 7;
    wd[w].sum += r;
    wd[w].count++;
    const minutes = (en - s) / 60000;
    const l = LENGTHS.findIndex((b) => minutes < b.max);
    len[l].sum += r;
    len[l].count++;
  }

  const groups = (acc: { sum: number; count: number }[], labels: string[]): FocusGroup[] =>
    acc.map((a, i) => ({ label: labels[i], count: a.count, average: a.count > 0 ? a.sum / a.count : null }));

  const byTimeOfDay = groups(tod, TIME_OF_DAY.map((b) => b.label));
  const byWeekday = groups(wd, WEEKDAY_LABELS);
  const byLength = groups(len, LENGTHS.map((b) => b.label));

  let best: FocusQuality['best'] = null;
  const consider = (dimension: 'time' | 'weekday' | 'length', list: FocusGroup[]) => {
    for (const g of list) {
      if (g.count < MIN_FOCUS_SAMPLE || g.average === null) continue;
      const cur = best?.group;
      if (!cur || g.average > (cur.average ?? 0) || (g.average === cur.average && g.count > cur.count)) {
        best = { dimension, group: g };
      }
    }
  };
  consider('time', byTimeOfDay);
  consider('weekday', byWeekday);
  consider('length', byLength);

  return {
    sessions,
    rated,
    average: rated > 0 ? sum / rated : null,
    distribution,
    byTimeOfDay,
    byWeekday,
    byLength,
    best,
  };
}

/**
 * Days in a row with focus time, ending at `today` — or at yesterday while
 * today has nothing yet, so a streak is not "broken" before the day starts.
 * Pass the running session in `events` (liveEventForDate) to count it.
 */
export function focusStreak(events: CalendarEvent[], today: Date = new Date()): number {
  const active = new Set(splitStudySlices(events).map((s) => s.date));
  let cursor = active.has(dateKey(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (active.has(dateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
