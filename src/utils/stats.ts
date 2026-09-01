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
