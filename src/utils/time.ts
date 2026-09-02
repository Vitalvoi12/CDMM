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

export function timeToPixels(dateStr: string, startHour: number, hourHeight: number): number {
  const d = new Date(dateStr);
  const totalMinutes = d.getHours() * 60 + d.getMinutes();
  const startMinutes = startHour * 60;
  return ((totalMinutes - startMinutes) / 60) * hourHeight;
}

export interface ShiftedEventTimes {
  start: Date;
  end: Date;
}

export function shiftEventByMinutes(
  startIso: string,
  endIso: string,
  deltaMinutes: number,
  startHour: number,
  endHour: number
): ShiftedEventTimes {
  const origStart = new Date(startIso);
  const origEnd = new Date(endIso);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const dayStart = new Date(
    origStart.getFullYear(),
    origStart.getMonth(),
    origStart.getDate()
  ).getTime();
  const minStartMs = Math.min(dayStart + startHour * 3600000, origStart.getTime());
  const maxStartMs = dayStart + endHour * 3600000 - durationMs;
  let newStartMs = origStart.getTime() + deltaMinutes * 60000;
  if (maxStartMs >= minStartMs) {
    newStartMs = Math.max(minStartMs, Math.min(maxStartMs, newStartMs));
  }
  return { start: new Date(newStartMs), end: new Date(newStartMs + durationMs) };
}

export function shiftEventEndByMinutes(
  endIso: string,
  startIso: string,
  deltaMinutes: number,
  endHour: number,
  minDurationMinutes = 15
): Date {
  const origEnd = new Date(endIso);
  const origStart = new Date(startIso);
  const endDayStart = new Date(
    origEnd.getFullYear(),
    origEnd.getMonth(),
    origEnd.getDate()
  ).getTime();
  const maxEndMs = endDayStart + endHour * 3600000;
  const minEndMs = origStart.getTime() + minDurationMinutes * 60000;
  if (maxEndMs < minEndMs) return origEnd;
  let newEndMs = origEnd.getTime() + deltaMinutes * 60000;
  newEndMs = Math.max(minEndMs, newEndMs);
  newEndMs = Math.min(maxEndMs, newEndMs);
  return new Date(newEndMs);
}
