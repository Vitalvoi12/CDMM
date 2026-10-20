export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDurationLong(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length > 0 ? parts.join(' ') : '0m';
}

export function formatTimerDuration(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function minutesBetween(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export function timeFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export type RepeatFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Expand a recurrence into concrete occurrences (inclusive of the base one).
 * Capped at `max` items so a forgotten "until" can't explode storage.
 */
export function expandRecurrence(
  start: Date,
  end: Date,
  freq: RepeatFreq,
  until: Date,
  max = 100
): { start: Date; end: Date }[] {
  if (freq === 'none') return [{ start, end }];
  const out: { start: Date; end: Date }[] = [];
  let curStart = new Date(start);
  let curEnd = new Date(end);
  const untilTime = until.getTime();
  while (curStart.getTime() <= untilTime && out.length < max) {
    out.push({ start: new Date(curStart), end: new Date(curEnd) });
    if (freq === 'daily') {
      curStart = addDays(curStart, 1);
      curEnd = addDays(curEnd, 1);
    } else if (freq === 'weekly') {
      curStart = addDays(curStart, 7);
      curEnd = addDays(curEnd, 7);
    } else if (freq === 'monthly') {
      curStart = addMonths(curStart, 1);
      curEnd = addMonths(curEnd, 1);
    } else {
      curStart = addYears(curStart, 1);
      curEnd = addYears(curEnd, 1);
    }
  }
  return out.length > 0 ? out : [{ start, end }];
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date): Date {
  const s = startOfWeek(date);
  return addDays(s, 6);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatWeekdayShort(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function formatDayOfMonth(date: Date): string {
  return String(date.getDate());
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function getMonthGrid(date: Date): (Date | null)[] {
  const first = startOfMonth(date);
  const grid: (Date | null)[] = [];
  const firstDayOfWeek = (first.getDay() + 6) % 7; // Monday=0
  for (let i = 0; i < firstDayOfWeek; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth(date); d++) {
    grid.push(new Date(date.getFullYear(), date.getMonth(), d));
  }
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

export function hourPosition(hour: number, startHour: number, hourHeight: number): number {
  return (hour - startHour) * hourHeight;
}

/** `dayOf`: measure from the start of that time's day instead of the time's
 *  own — pass an event's start for its end, so an end at midnight lands at
 *  24:00 (the bottom of the grid), not at 00:00 (the top). */
export function timeToPixels(dateStr: string, startHour: number, hourHeight: number, dayOf?: string): number {
  const d = new Date(dateStr);
  const totalMinutes = dayOf
    ? Math.round((d.getTime() - startOfDay(new Date(dayOf)).getTime()) / 60000)
    : d.getHours() * 60 + d.getMinutes();
  const startMinutes = startHour * 60;
  return ((totalMinutes - startMinutes) / 60) * hourHeight;
}

export interface ShiftedEventTimes {
  start: Date;
  end: Date;
}

/**
 * Move an event by `deltaMinutes`. It may cross midnight either way (it is
 * then shown cut on both days, see dayBox), as long as at least
 * `minVisibleMinutes` of it stay on the day being dragged on (`dayOf`, by
 * default the start's day) — the block never slips out from under the
 * pointer. An event already further out than that never jumps.
 */
export function shiftEventByMinutes(
  startIso: string,
  endIso: string,
  deltaMinutes: number,
  startHour: number,
  endHour: number,
  dayOf?: string,
  minVisibleMinutes = 15
): ShiftedEventTimes {
  const origStart = new Date(startIso);
  const origEnd = new Date(endIso);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const dayStart = startOfDay(dayOf ? new Date(dayOf) : origStart).getTime();
  const visibleMs = Math.min(minVisibleMinutes * 60000, durationMs);
  const minStartMs = Math.min(dayStart + startHour * 3600000 + visibleMs - durationMs, origStart.getTime());
  const maxStartMs = Math.max(dayStart + endHour * 3600000 - visibleMs, origStart.getTime());
  const newStartMs = Math.max(minStartMs, Math.min(maxStartMs, origStart.getTime() + deltaMinutes * 60000));
  return { start: new Date(newStartMs), end: new Date(newStartMs + durationMs) };
}

/**
 * Where an event sits in one day's grid. An event crossing midnight is cut
 * at 00:00 / 24:00 and shown on each day it touches (as Google Calendar
 * does); `clippedTop` / `clippedBottom` say which edges were cut.
 */
export function dayBox(
  startIso: string,
  endIso: string,
  dayIso: string,
  startHour: number,
  endHour: number,
  hourHeight: number
): { top: number; bottom: number; startPx: number; endPx: number; clippedTop: boolean; clippedBottom: boolean } {
  const startPx = timeToPixels(startIso, startHour, hourHeight, dayIso);
  const endPx = timeToPixels(endIso, startHour, hourHeight, dayIso);
  const gridPx = (endHour - startHour) * hourHeight;
  return {
    top: Math.max(0, startPx),
    bottom: Math.min(gridPx, endPx),
    startPx,
    endPx,
    clippedTop: startPx < 0,
    clippedBottom: endPx > gridPx,
  };
}

/** The same wall-clock moment `days` calendar days later (DST-safe). */
export function shiftDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export interface OverlapLane {
  /** Horizontal offset from the column's left edge, in percent. */
  left: number;
  /** Card width in percent (may exceed 100 — the column clips the overflow). */
  width: number;
  /** Stacking order inside the column. */
  z: number;
}

/**
 * Assigns each event of a single column a horizontal lane so overlapping
 * blocks stay individually readable. Events are grouped into clusters of
 * transitively-overlapping time ranges; inside a cluster every event takes
 * the first lane that is free at its start time, and the cluster's lane count
 * drives the geometry: lane i starts at i * (100 / lanes) and runs to the
 * column edge, so fanned cards shorten instead of being clipped by it.
 */
export function layoutOverlapLanes(
  events: { id: string; start: string; end: string }[]
): Record<string, OverlapLane> {
  const out: Record<string, OverlapLane> = {};
  const sorted = [...events].sort((a, b) => {
    const byStart = new Date(a.start).getTime() - new Date(b.start).getTime();
    if (byStart !== 0) return byStart;
    // Longer blocks first so a short event can reuse the lane underneath it.
    return new Date(b.end).getTime() - new Date(a.end).getTime();
  });

  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned: { ev: (typeof sorted)[number]; lane: number }[] = [];
    for (const ev of cluster) {
      const startMs = new Date(ev.start).getTime();
      let lane = laneEnds.findIndex((endMs) => endMs <= startMs);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = new Date(ev.end).getTime();
      assigned.push({ ev, lane });
    }
    const lanes = Math.max(laneEnds.length, 1);
    const step = 100 / lanes;
    for (const { ev, lane } of assigned) {
      const left = lane * step;
      out[ev.id] = { left, width: 100 - left, z: lane + 1 };
    }
  };

  for (const ev of sorted) {
    const startMs = new Date(ev.start).getTime();
    const endMs = new Date(ev.end).getTime();
    if (cluster.length > 0 && startMs >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, endMs);
  }
  flush();
  return out;
}

/**
 * Move an event's end by `deltaMinutes`. With `dayOf` (the day being resized
 * on) the end may run past midnight, up to the end of the following day; the
 * event is then shown cut on both days (see dayBox). Without it the end stays
 * within its own day.
 */
export function shiftEventEndByMinutes(
  endIso: string,
  startIso: string,
  deltaMinutes: number,
  endHour: number,
  minDurationMinutes = 15,
  dayOf?: string
): Date {
  const origEnd = new Date(endIso);
  const origStart = new Date(startIso);
  const maxEndMs = dayOf
    ? Math.max(origEnd.getTime(), startOfDay(new Date(dayOf)).getTime() + (endHour + 24) * 3600000)
    : startOfDay(origEnd).getTime() + endHour * 3600000;
  const minEndMs = origStart.getTime() + minDurationMinutes * 60000;
  if (maxEndMs < minEndMs) return origEnd;
  let newEndMs = origEnd.getTime() + deltaMinutes * 60000;
  newEndMs = Math.max(minEndMs, newEndMs);
  newEndMs = Math.min(maxEndMs, newEndMs);
  return new Date(newEndMs);
}
