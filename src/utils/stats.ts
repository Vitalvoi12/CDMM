import type { CalendarEvent, DailyStatistics, Subject } from '../types';
import { DEFAULT_CUSTOM_COLOR } from './color';
import { minutesBetween, startOfDay, endOfDay, dateKey } from './time';

/**
 * Real events that count toward statistics. Events explicitly excluded via
 * the "Count in stats" flag never contribute — to totals, distributions,
 * heatmaps or plan progress. Absent flag = counts (backward compat).
 */
export function countsTowardStats(e: CalendarEvent): boolean {
  return e.kind !== 'plan' && e.countInStats !== false;
}

export interface StudyHeatmapDay {
  date: string;
  totalMinutes: number;
  sessionCount: number;
}

export interface YearStudyStats {
  totalMinutes: number;
  activeDays: number;
  sessionCount: number;
  averageSessionMinutes: number;
  bestDay: { date: string; minutes: number } | null;
  longestStreakDays: number;
}

export function getEventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  return events
    .filter((e) => {
      const s = new Date(e.start).getTime();
      const en = new Date(e.end).getTime();
      return s < dayEnd && en > dayStart;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * The running study session, as the event it will become once it is finished.
 *
 * A live session has no stored record yet — `eventRepo` only sees it on Finish —
 * so any total built purely from the day's events silently misses it. This
 * builds a transient real event from the session, clipped to the boundaries of
 * `date`: a session started at 23:30 contributes only its half hour to
 * yesterday and the rest to today, exactly like the stored event will once the
 * session ends.
 *
 * Returns null when the session does not touch this day at all (viewing a past
 * or future date, or a zero-length span), so callers can leave their list
 * untouched.
 */
/** The running session as the calendar and lists see it. */
export interface LiveSessionRef {
  subjectId: string;
  start: string;
  /** Custom (subject-less) session name and color. */
  title?: string;
  color?: string;
  /** `false` for a session started as not counting toward statistics. */
  countInStats?: boolean;
}

/**
 * Name and color to show for a live session: its subject, or the custom
 * title/color of a subject-less session.
 */
export function liveSessionSubject(
  session: LiveSessionRef | null | undefined,
  subjects: Record<string, Subject>
): Subject | undefined {
  if (!session) return undefined;
  const subject = subjects[session.subjectId];
  if (subject) return subject;
  if (!session.title) return undefined;
  return { id: '', name: session.title, color: session.color || DEFAULT_CUSTOM_COLOR, updatedAt: 0 };
}

export function liveEventForDate(
  session: LiveSessionRef | null | undefined,
  date: Date,
  now: number = Date.now()
): CalendarEvent | null {
  if (!session) return null;
  const sessionStart = new Date(session.start).getTime();
  if (!Number.isFinite(sessionStart)) return null;

  const start = Math.max(sessionStart, startOfDay(date).getTime());
  const end = Math.min(now, endOfDay(date).getTime());
  if (end <= start) return null;

  return {
    id: '__live__',
    uid: '__live__@cdmm',
    subjectId: session.subjectId,
    title: session.title || session.subjectId,
    color: session.color,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    kind: 'real',
    countInStats: session.countInStats !== false,
    updatedAt: 0,
  };
}

export function calculateDailyStats(
  events: CalendarEvent[],
  date: Date,
  subjectMinutes?: Record<string, number>
): DailyStatistics {
  const dayEvents = getEventsForDate(events, date).filter(countsTowardStats);
  let totalMinutes = 0;
  const subjMinutes: Record<string, number> = subjectMinutes || {};

  dayEvents.forEach((e) => {
    const mins = minutesBetween(e.start, e.end);
    totalMinutes += mins;
    subjMinutes[e.subjectId] = (subjMinutes[e.subjectId] || 0) + mins;
  });

  const now = new Date();
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  const nowTime = now.getTime();

  let currentEvent: CalendarEvent | null = null;
  let nextEvent: CalendarEvent | null = null;

  if (dateKey(date) === dateKey(now)) {
    for (const e of dayEvents) {
      const s = new Date(e.start).getTime();
      const en = new Date(e.end).getTime();
      if (s <= nowTime && en >= nowTime) {
        currentEvent = e;
      }
    }
    for (const e of dayEvents) {
      const s = new Date(e.start).getTime();
      if (s > nowTime) {
        nextEvent = e;
        break;
      }
    }
  } else if (nowTime > dayEnd) {
    if (dayEvents.length > 0) {
      currentEvent = dayEvents[dayEvents.length - 1];
    }
  } else if (nowTime < dayStart) {
    if (dayEvents.length > 0) {
      nextEvent = dayEvents[0];
    }
  }

  return {
    date: dateKey(date),
    totalMinutes,
    sessionCount: dayEvents.length,
    subjectMinutes: subjMinutes,
    currentEvent,
    nextEvent,
  };
}

export interface PlanStat {
  subjectId: string;
  planMinutes: number;
  realMinutes: number;
  /** Real against plan, rounded; 0 when there is no plan. */
  percentage: number;
  hasPlan: boolean;
}

/**
 * Plan vs real per subject for one day's events:
 * percent = real minutes (subject) / plan minutes (subject) * 100.
 * The stats flag drops the event from whichever side it belongs to: a real
 * event leaves the numerator, a planned one leaves the plan sum (plans
 * never touch Total Focus Time). Subjects with a plan or real time only,
 * biggest first.
 */
export function calculatePlanStats(events: CalendarEvent[]): { stats: PlanStat[]; totalPlan: number } {
  const planBySubject: Record<string, number> = {};
  const realBySubject: Record<string, number> = {};
  let totalPlan = 0;
  for (const e of events) {
    if (e.countInStats === false) continue;
    const mins = Math.max(0, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000));
    if (e.kind === 'plan') {
      planBySubject[e.subjectId] = (planBySubject[e.subjectId] || 0) + mins;
      totalPlan += mins;
    } else {
      realBySubject[e.subjectId] = (realBySubject[e.subjectId] || 0) + mins;
    }
  }
  const stats = [...new Set([...Object.keys(planBySubject), ...Object.keys(realBySubject)])]
    .map((subjectId) => {
      const plan = planBySubject[subjectId] || 0;
      const real = realBySubject[subjectId] || 0;
      return {
        subjectId,
        planMinutes: plan,
        realMinutes: real,
        percentage: plan > 0 ? Math.round((real / plan) * 100) : 0,
        hasPlan: plan > 0,
      };
    })
    .sort((a, b) => b.planMinutes + b.realMinutes - (a.planMinutes + a.realMinutes));
  return { stats, totalPlan };
}

export function calculateSubjectStats(
  events: CalendarEvent[],
  totalMinutes: number
): { subjectId: string; minutes: number; percentage: number }[] {
  const subjectMinutes: Record<string, number> = {};
  events.filter(countsTowardStats).forEach((e) => {
    subjectMinutes[e.subjectId] =
      (subjectMinutes[e.subjectId] || 0) + minutesBetween(e.start, e.end);
  });

  return Object.entries(subjectMinutes)
    .map(([subjectId, minutes]) => ({
      subjectId,
      minutes,
      percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Per-day study totals for an arbitrary local-timezone range (inclusive).
 * Events crossing midnight contribute to each day proportionally, so a
 * session never lands on the wrong day. Returns entries in chronological
 * order, one per calendar day from `from` to `to`.
 */
export function buildHeatmapRange(
  events: CalendarEvent[],
  from: Date,
  to: Date
): StudyHeatmapDay[] {
  const days: StudyHeatmapDay[] = [];
  const totals = new Map<string, { minutes: number; count: number }>();

  const addMinutes = (key: string, minutes: number, counted: boolean) => {
    const entry = totals.get(key) || { minutes: 0, count: 0 };
    entry.minutes += minutes;
    if (counted) entry.count += 1;
    totals.set(key, entry);
  };

  for (const e of events.filter(countsTowardStats)) {
    const startMs = new Date(e.start).getTime();
    const endMs = new Date(e.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    let cursor = startMs;
    while (cursor < endMs) {
      const day = new Date(cursor);
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      const sliceEnd = Math.min(endMs, dayEnd);
      const minutes = (sliceEnd - cursor) / 60000;
      if (minutes >= 1) {
        addMinutes(dateKey(day), minutes, cursor === startMs);
      }
      cursor = sliceEnd;
    }
  }

  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor.getTime() <= end.getTime()) {
    const key = dateKey(cursor);
    const entry = totals.get(key);
    days.push({
      date: key,
      totalMinutes: entry ? Math.round(entry.minutes) : 0,
      sessionCount: entry ? entry.count : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Calendar-year study days (Jan 1 – Dec 31), for the year-wide streak the
 * Focus Room shows.
 */
export function buildYearHeatmap(events: CalendarEvent[], year: number): StudyHeatmapDay[] {
  return buildHeatmapRange(events, new Date(year, 0, 1), new Date(year, 11, 31));
}

export function calculateYearStats(heatmap: StudyHeatmapDay[]): YearStudyStats {
  let totalMinutes = 0;
  let activeDays = 0;
  let sessionCount = 0;
  let bestDay: { date: string; minutes: number } | null = null;
  let streak = 0;
  let longestStreak = 0;

  for (const day of heatmap) {
    totalMinutes += day.totalMinutes;
    sessionCount += day.sessionCount;
    if (day.totalMinutes > 0) {
      activeDays++;
      streak++;
      if (streak > longestStreak) longestStreak = streak;
      if (!bestDay || day.totalMinutes > bestDay.minutes) {
        bestDay = { date: day.date, minutes: day.totalMinutes };
      }
    } else {
      streak = 0;
    }
  }

  return {
    totalMinutes,
    activeDays,
    sessionCount,
    averageSessionMinutes: sessionCount > 0 ? Math.round(totalMinutes / sessionCount) : 0,
    bestDay,
    longestStreakDays: longestStreak,
  };
}
