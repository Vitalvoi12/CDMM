import type { CalendarEvent, DailyStatistics, WeeklyStatistics } from '../types';
import {
  minutesBetween,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  dateKey,
  addDays,
} from './time';

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

export function getEventsForRange(events: CalendarEvent[], from: Date, to: Date): CalendarEvent[] {
  const fromTime = startOfDay(from).getTime();
  const toTime = endOfDay(to).getTime();
  return events.filter((e) => {
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    return s < toTime && en > fromTime;
  });
}

export function calculateDailyStats(
  events: CalendarEvent[],
  date: Date,
  subjectMinutes?: Record<string, number>
): DailyStatistics {
  const dayEvents = getEventsForDate(events, date);
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

export function calculateWeeklyStats(
  events: CalendarEvent[],
  weekDate: Date
): WeeklyStatistics {
  const weekStart = startOfWeek(weekDate);
  const weekEnd = endOfWeek(weekDate);
  let totalMinutes = 0;
  const dailyMinutes: number[] = [];
  const subjectMinutes: Record<string, number> = {};

  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const dayEvents = getEventsForDate(events, day);
    let dayMins = 0;
    dayEvents.forEach((e) => {
      const mins = minutesBetween(e.start, e.end);
      dayMins += mins;
      totalMinutes += mins;
      subjectMinutes[e.subjectId] = (subjectMinutes[e.subjectId] || 0) + mins;
    });
    dailyMinutes.push(dayMins);
  }

  const dailyAverage = Math.round(totalMinutes / 7);

  let mostStudiedSubject: { subjectId: string; minutes: number } | null = null;
  for (const [subjId, mins] of Object.entries(subjectMinutes)) {
    if (!mostStudiedSubject || mins > mostStudiedSubject.minutes) {
      mostStudiedSubject = { subjectId: subjId, minutes: mins };
    }
  }

  return {
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(weekEnd),
    totalMinutes,
    dailyMinutes,
    dailyAverage,
    subjectMinutes,
    mostStudiedSubject,
  };
}

export function calculateSubjectStats(
  events: CalendarEvent[],
  totalMinutes: number
): { subjectId: string; minutes: number; percentage: number }[] {
  const subjectMinutes: Record<string, number> = {};
  events.forEach((e) => {
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
 * Per-day study totals for a whole year (local-timezone days). Events crossing
 * midnight contribute to each day proportionally, so a session never lands on
 * the wrong day. Returns exactly 365/366 entries in chronological order.
 */
export function buildYearHeatmap(events: CalendarEvent[], year: number): StudyHeatmapDay[] {
  const days: StudyHeatmapDay[] = [];
  const totals = new Map<string, { minutes: number; count: number }>();

  const addMinutes = (key: string, minutes: number, counted: boolean) => {
    const entry = totals.get(key) || { minutes: 0, count: 0 };
    entry.minutes += minutes;
    if (counted) entry.count += 1;
    totals.set(key, entry);
  };

  for (const e of events) {
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

  const cursor = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  while (cursor < end) {
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
 * Monochrome intensity level for the heatmap. Fixed thresholds keep the scale
 * meaningful across users: 0 / <=30 / <=60 / <=120 / >120 minutes.
 */
export function heatmapLevel(totalMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (totalMinutes <= 0) return 0;
  if (totalMinutes <= 30) return 1;
  if (totalMinutes <= 60) return 2;
  if (totalMinutes <= 120) return 3;
  return 4;
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
