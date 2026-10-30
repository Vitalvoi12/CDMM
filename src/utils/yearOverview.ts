import type { CalendarEvent, Subject } from '../types';
import { splitStudySlices } from './analytics';
import { calculateYearStats, countsTowardPlan } from './stats';
import { addDays, dateKey, startOfWeek } from './time';

/**
 * The year as a study overview (desktop Calendar → Year).
 *
 * Real time is the same as everywhere else: splitStudySlices (counted sessions
 * cut at hour and day boundaries), keyed by local day. Plan time is the set of
 * events the day's "plan vs real" sums (countsTowardPlan), cut at midnight the
 * same way so a plan crossing midnight lands on both days by its own minutes.
 */

export type FocusLevel = 0 | 1 | 2 | 3 | 4;

export interface YearOverviewDay {
  date: string;
  real: number;
  plan: number;
  sessions: number;
  isFuture: boolean;
  isToday: boolean;
  /** Shade in "Focus time" mode: 0 = no study, 1–4 = quartile of this year's active days. */
  focusLevel: FocusLevel;
  /** Shade in "Plan kept" mode, or null when the day had no plan. */
  planLevel: FocusLevel | null;
}

export interface YearOverviewMonth {
  month: number;
  real: number;
  /** All planned minutes, days still ahead included. */
  plan: number;
  /** Planned minutes on days up to today: the base of "% of plan". */
  planPast: number;
  kept: number;
  activeDays: number;
  pastDays: number;
  /** Real minutes per subject id. */
  bySubject: Record<string, number>;
}

export interface YearOverviewSubject {
  subjectId: string;
  name: string;
  color: string;
  minutes: number;
  /** Share of the year's focus, 0–1. */
  share: number;
  goalMinutes: number;
  weeksGoalMet: number;
  weeksElapsed: number;
}

export interface YearOverviewTotals {
  focusMinutes: number;
  activeDays: number;
  pastDays: number;
  sessions: number;
  avgPerActiveDay: number;
  avgSession: number;
  /** Planned minutes on days up to today. */
  planMinutes: number;
  /** Sum of min(real, plan) over those days. */
  keptMinutes: number;
  bestDay: { date: string; minutes: number } | null;
  longestStreak: { days: number; from: string | null; to: string | null };
  currentStreak: { days: number; since: string | null };
}

export interface YearOverview {
  year: number;
  totals: YearOverviewTotals;
  days: YearOverviewDay[];
  months: YearOverviewMonth[];
  subjects: YearOverviewSubject[];
}

/** Focus shade from the year's quartile cut points [q1, q2, q3]. */
export function focusLevel(real: number, quartiles: [number, number, number] | null): FocusLevel {
  if (real <= 0 || !quartiles) return 0;
  if (real <= quartiles[0]) return 1;
  if (real <= quartiles[1]) return 2;
  if (real <= quartiles[2]) return 3;
  return 4;
}

/** Plan-kept shade: real / plan bands 0, <50%, <75%, <95%, 95%+. */
export function planLevel(real: number, plan: number): FocusLevel | null {
  if (plan <= 0) return null;
  const r = real / plan;
  if (r <= 0) return 0;
  if (r < 0.5) return 1;
  if (r < 0.75) return 2;
  if (r < 0.95) return 3;
  return 4;
}

/**
 * Quartile cut points of the active days' minutes. Quantiles of this year's
 * own days rather than fixed hour thresholds: on a dense year fixed
 * thresholds flood every day with the top shade.
 */
export function focusQuartiles(activeMinutes: number[]): [number, number, number] | null {
  if (activeMinutes.length === 0) return null;
  const a = [...activeMinutes].sort((x, y) => x - y);
  const at = (p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return [at(0.25), at(0.5), at(0.75)];
}

/** Split plan events at local midnight into minutes per day key. */
function planByDay(events: CalendarEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (!countsTowardPlan(e)) continue;
    const startMs = new Date(e.start).getTime();
    const endMs = new Date(e.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    let cursor = startMs;
    while (cursor < endMs) {
      const at = new Date(cursor);
      const dayEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime();
      const sliceEnd = Math.min(endMs, dayEnd);
      const minutes = Math.round((sliceEnd - cursor) / 60000);
      if (minutes > 0) out.set(dateKey(at), (out.get(dateKey(at)) ?? 0) + minutes);
      cursor = sliceEnd;
    }
  }
  return out;
}

/**
 * Everything the desktop year view shows, from the raw events. Pure: `today`
 * decides which days are past, so the result is fixed for given inputs.
 */
export function buildYearOverview(year: number, events: CalendarEvent[], subjects: Subject[], today: Date): YearOverview {
  const todayKey = dateKey(today);
  const prefix = `${year}-`;
  const slices = splitStudySlices(events);
  const plans = planByDay(events);

  const real = new Map<string, number>();
  const sessions = new Map<string, number>();
  const realBySubject = new Map<string, Map<string, number>>();
  for (const s of slices) {
    if (!s.date.startsWith(prefix)) continue;
    real.set(s.date, (real.get(s.date) ?? 0) + s.minutes);
    if (s.sessionStart) sessions.set(s.date, (sessions.get(s.date) ?? 0) + 1);
    let bySubj = realBySubject.get(s.date);
    if (!bySubj) realBySubject.set(s.date, (bySubj = new Map()));
    bySubj.set(s.subjectId, (bySubj.get(s.subjectId) ?? 0) + s.minutes);
  }

  // ---- days ----
  const days: YearOverviewDay[] = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d = addDays(d, 1)) {
    const key = dateKey(d);
    days.push({
      date: key,
      real: real.get(key) ?? 0,
      plan: plans.get(key) ?? 0,
      sessions: sessions.get(key) ?? 0,
      isFuture: key > todayKey,
      isToday: key === todayKey,
      focusLevel: 0,
      planLevel: null,
    });
  }
  const past = days.filter((d) => !d.isFuture);
  const quartiles = focusQuartiles(past.filter((d) => d.real > 0).map((d) => d.real));
  for (const d of past) {
    d.focusLevel = focusLevel(d.real, quartiles);
    d.planLevel = planLevel(d.real, d.plan);
  }

  // ---- totals ----
  const stats = calculateYearStats(past.map((d) => ({ date: d.date, totalMinutes: d.real, sessionCount: d.sessions })));
  let planMinutes = 0;
  let keptMinutes = 0;
  for (const d of past) {
    if (d.plan <= 0) continue;
    planMinutes += d.plan;
    keptMinutes += Math.min(d.real, d.plan);
  }
  // Same rule as focusStreak: the run ends today, or yesterday while today is
  // still empty. It stops at Jan 1: the overview only sees this year.
  let currentDays = 0;
  let since: string | null = null;
  const todayIdx = days.findIndex((d) => d.isToday);
  if (todayIdx >= 0) {
    let i = days[todayIdx].real > 0 ? todayIdx : todayIdx - 1;
    while (i >= 0 && days[i].real > 0) {
      currentDays++;
      since = days[i].date;
      i--;
    }
  }

  const totals: YearOverviewTotals = {
    focusMinutes: stats.totalMinutes,
    activeDays: stats.activeDays,
    pastDays: past.length,
    sessions: stats.sessionCount,
    avgPerActiveDay: stats.activeDays > 0 ? Math.round(stats.totalMinutes / stats.activeDays) : 0,
    avgSession: stats.averageSessionMinutes,
    planMinutes,
    keptMinutes,
    bestDay: stats.bestDay,
    longestStreak: { days: stats.longestStreakDays, from: stats.longestStreakFrom, to: stats.longestStreakTo },
    currentStreak: { days: currentDays, since },
  };

  // ---- months ----
  const months: YearOverviewMonth[] = Array.from({ length: 12 }, (_, month) => ({
    month,
    real: 0,
    plan: 0,
    planPast: 0,
    kept: 0,
    activeDays: 0,
    pastDays: 0,
    bySubject: {},
  }));
  for (const d of days) {
    const m = months[Number(d.date.slice(5, 7)) - 1];
    m.plan += d.plan;
    if (d.isFuture) continue;
    m.pastDays++;
    m.real += d.real;
    if (d.real > 0) m.activeDays++;
    if (d.plan > 0) {
      m.planPast += d.plan;
      m.kept += Math.min(d.real, d.plan);
    }
    for (const [id, min] of realBySubject.get(d.date) ?? []) m.bySubject[id] = (m.bySubject[id] ?? 0) + min;
  }

  // ---- subjects ----
  const yearBySubject = new Map<string, number>();
  for (const m of months) for (const [id, min] of Object.entries(m.bySubject)) yearBySubject.set(id, (yearBySubject.get(id) ?? 0) + min);

  // Weeks run Monday–Sunday, from the one holding Jan 1 to the one holding
  // today (or Dec 31). Week minutes use every slice, so a week crossing New
  // Year is judged on all seven days. Goal history is not stored: every week
  // is measured against the subject's current goal.
  const weekMinutes = new Map<string, Map<string, number>>();
  for (const s of slices) {
    const [y, mo, da] = s.date.split('-').map(Number);
    const wk = dateKey(startOfWeek(new Date(y, mo - 1, da)));
    let w = weekMinutes.get(wk);
    if (!w) weekMinutes.set(wk, (w = new Map()));
    w.set(s.subjectId, (w.get(s.subjectId) ?? 0) + s.minutes);
  }
  const weekStarts: string[] = [];
  const lastDay = todayKey < `${year}-12-31` ? today : new Date(year, 11, 31);
  if (todayKey >= `${year}-01-01`) {
    for (let w = startOfWeek(new Date(year, 0, 1)); w <= lastDay; w = addDays(w, 7)) weekStarts.push(dateKey(w));
  }

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const ids = new Set([...yearBySubject.keys(), ...subjects.filter((s) => (s.weeklyGoalMinutes ?? 0) > 0).map((s) => s.id)]);
  const total = totals.focusMinutes;
  const subjectRows: YearOverviewSubject[] = [...ids].map((id) => {
    const s = subjectById.get(id);
    const minutes = yearBySubject.get(id) ?? 0;
    const goal = s?.weeklyGoalMinutes ?? 0;
    let met = 0;
    if (goal > 0) for (const wk of weekStarts) if ((weekMinutes.get(wk)?.get(id) ?? 0) >= goal) met++;
    return {
      subjectId: id,
      name: s?.name ?? (id ? 'Deleted subject' : 'No subject'),
      color: s?.color ?? '#8A857C',
      minutes,
      share: total > 0 ? minutes / total : 0,
      goalMinutes: goal,
      weeksGoalMet: met,
      weeksElapsed: goal > 0 ? weekStarts.length : 0,
    };
  });
  subjectRows.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

  return { year, totals, days, months, subjects: subjectRows };
}
