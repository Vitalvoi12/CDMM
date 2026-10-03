import type { CalendarEvent, DailyStatistics } from '../types';
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
