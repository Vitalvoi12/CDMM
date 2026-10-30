import type { CalendarEvent, DayTaskList, Subject } from '../types';
import { countsTowardStats } from './stats';
import { addDays, dateKey, formatDuration, startOfDay, startOfWeek } from './time';

/** Real focus minutes per subject in this Monday–Sunday week (running session included). */
export function weekMinutes(events: CalendarEvent[], now: number): Map<string, number> {
  const from = startOfWeek(new Date(now)).getTime();
  const to = addDays(new Date(from), 7).getTime();
  const out = new Map<string, number>();
  for (const e of events) {
    if (!countsTowardStats(e)) continue;
    const s = Math.max(from, Date.parse(e.start));
    const en = Math.min(to, Date.parse(e.end));
    if (en > s) out.set(e.subjectId, (out.get(e.subjectId) || 0) + Math.round((en - s) / 60000));
  }
  return out;
}

/** The running session as one real event, from its start to `now` (not clipped to a day). */
export function liveSessionEvent(
  session: { subjectId: string; start: string; countInStats?: boolean } | null,
  now: number
): CalendarEvent | null {
  if (!session) return null;
  const start = Date.parse(session.start);
  if (!Number.isFinite(start) || now <= start) return null;
  return {
    id: '__live__',
    uid: '__live__@cdmm',
    subjectId: session.subjectId,
    title: session.subjectId,
    start: new Date(start).toISOString(),
    end: new Date(now).toISOString(),
    kind: 'real',
    countInStats: session.countInStats !== false,
    updatedAt: 0,
  };
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' });

/** Whole calendar days from `now`'s day to `d`'s day (negative = past). */
function dayDiff(d: Date, now: number): number {
  return Math.round((startOfDay(d).getTime() - startOfDay(new Date(now)).getTime()) / 86400000);
}

/** "Today", "Yesterday", a weekday within the last 7 days, else "Oct 12". */
export function pastDayLabel(d: Date, now: number): string {
  const diff = dayDiff(d, now);
  if (diff >= 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff > -7) return weekday(d);
  return shortDate(d);
}

/** "Today", a weekday within the next 7 days, else "Nov 12". */
export function futureDayLabel(d: Date, now: number): string {
  const diff = dayDiff(d, now);
  if (diff <= 0) return 'Today';
  if (diff < 7) return weekday(d);
  return shortDate(d);
}

/** ISO 8601 week number (weeks start on Monday). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** One row of the Subjects list. */
export interface SubjectRowStats {
  thisWeek: number;
  /** "Now", "Today", "Yesterday", "Tue", "Oct 12" or "—". */
  lastStudied: string;
  /** "Today 15:30", "Fri 15:30", "Nov 12 09:00" or "—". */
  nextPlanned: string;
}

/**
 * Per subject: this week's real minutes, when it was last studied and its
 * next planned block. `events` should include the running session (see
 * liveSessionEvent) so its minutes count; `liveId` marks it as "Now".
 */
export function subjectRows(subjects: Subject[], events: CalendarEvent[], liveId: string | null, now: number): Map<string, SubjectRowStats> {
  const week = weekMinutes(events, now);
  const lastEnd = new Map<string, number>();
  const nextStart = new Map<string, number>();
  for (const e of events) {
    if (e.kind === 'plan') {
      const s = Date.parse(e.start);
      if (s >= now && s < (nextStart.get(e.subjectId) ?? Infinity)) nextStart.set(e.subjectId, s);
    } else {
      const en = Date.parse(e.end);
      if (en > (lastEnd.get(e.subjectId) ?? -Infinity)) lastEnd.set(e.subjectId, en);
    }
  }
  const out = new Map<string, SubjectRowStats>();
  for (const s of subjects) {
    const last = lastEnd.get(s.id);
    const next = nextStart.get(s.id);
    out.set(s.id, {
      thisWeek: week.get(s.id) || 0,
      lastStudied: liveId === s.id ? 'Now' : last === undefined ? '—' : pastDayLabel(new Date(last), now),
      nextPlanned: next === undefined ? '—' : `${futureDayLabel(new Date(next), now)} ${hhmm(new Date(next))}`,
    });
  }
  return out;
}

export interface WeekBar {
  /** Monday 00:00 of the week. */
  start: Date;
  /** "W37". */
  label: string;
  minutes: number;
}

export interface SubjectDetail {
  thisWeek: number;
  /** Days left in this week, today included. */
  daysLeft: number;
  /** Oldest first; the current week is last. */
  last8Weeks: WeekBar[];
  sessionsThisWeek: number;
  /** Mean focus rating (1–3) over the same 8 weeks, or null without ratings. */
  avgFocus: number | null;
  allTimeMinutes: number;
  /** Start of the first real session, if any. */
  firstSession: Date | null;
  /** Up to 3 next planned blocks. */
  upcoming: { id: string; day: string; time: string; length: string }[];
  /** Up to 3 open checklist tasks from today on, and how many there are. */
  openTasks: { id: string; text: string; day: string }[];
  openTaskCount: number;
  /** Events that keep this subject id (they stay in the calendar on delete). */
  realCount: number;
  planCount: number;
}

/** Everything the desktop Subjects panel shows for one subject. */
export function subjectDetail(subjectId: string, events: CalendarEvent[], dayTasks: DayTaskList[], now: number): SubjectDetail {
  const weekStart = startOfWeek(new Date(now));
  const weekEnd = addDays(weekStart, 7).getTime();
  const firstWeek = addDays(weekStart, -7 * 7);
  const weeks: WeekBar[] = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(firstWeek, i * 7);
    return { start, label: `W${isoWeek(start)}`, minutes: 0 };
  });
  const from8 = firstWeek.getTime();

  let sessionsThisWeek = 0;
  let focusSum = 0;
  let focusCount = 0;
  let allTime = 0;
  let first = Infinity;
  let realCount = 0;
  let planCount = 0;
  const plans: CalendarEvent[] = [];

  for (const e of events) {
    if (e.subjectId !== subjectId) continue;
    const s = Date.parse(e.start);
    const en = Date.parse(e.end);
    if (e.kind === 'plan') {
      if (e.id !== '__live__') planCount++;
      if (s >= now) plans.push(e);
      continue;
    }
    if (e.id !== '__live__') realCount++;
    if (s < first) first = s;
    if (s >= from8 && s < weekEnd && e.focus) {
      focusSum += e.focus;
      focusCount++;
    }
    if (!countsTowardStats(e)) continue;
    allTime += Math.max(0, Math.round((en - s) / 60000));
    if (s >= weekStart.getTime() && s < weekEnd) sessionsThisWeek++;
    // Minutes per week, clipped to each week (a session over midnight Sunday splits).
    for (const w of weeks) {
      const ws = w.start.getTime();
      const we = addDays(w.start, 7).getTime();
      const a = Math.max(ws, s);
      const b = Math.min(we, en);
      if (b > a) w.minutes += Math.round((b - a) / 60000);
    }
  }

  plans.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const upcoming = plans.slice(0, 3).map((e) => {
    const s = new Date(e.start);
    const en = new Date(e.end);
    return {
      id: e.id,
      day: futureDayLabel(s, now),
      time: `${hhmm(s)} – ${hhmm(en)}`,
      length: formatDuration(Math.max(0, Math.round((en.getTime() - s.getTime()) / 60000))),
    };
  });

  const todayKey = dateKey(new Date(now));
  const open = dayTasks
    .filter((l) => l.id >= todayKey)
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((l) => {
      const [y, m, d] = l.id.split('-').map(Number);
      const day = futureDayLabel(new Date(y, m - 1, d), now);
      return l.tasks.filter((t) => !t.done && t.subjectId === subjectId).map((t) => ({ id: t.id, text: t.text, day }));
    });

  const today = startOfDay(new Date(now));
  return {
    thisWeek: weeks[7].minutes,
    daysLeft: Math.round((weekEnd - today.getTime()) / 86400000),
    last8Weeks: weeks,
    sessionsThisWeek,
    avgFocus: focusCount ? focusSum / focusCount : null,
    allTimeMinutes: allTime,
    firstSession: Number.isFinite(first) ? new Date(first) : null,
    upcoming,
    openTasks: open.slice(0, 3),
    openTaskCount: open.length,
    realCount,
    planCount,
  };
}
