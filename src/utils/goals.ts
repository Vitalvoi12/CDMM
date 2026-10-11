import type { CalendarEvent, Subject } from '../types';
import { countsTowardStats } from './stats';
import { addDays, startOfDay, startOfWeek } from './time';

export interface GoalProgress {
  subjectId: string;
  name: string;
  color: string;
  goalMinutes: number;
  /** Real focus minutes inside the window. */
  minutes: number;
  /** minutes / goal, 0-100+ (uncapped — going past the goal shows over 100). */
  percent: number;
}

/** "6h", "4h 30m", "45m" — the goal as the subject form writes it. */
export function formatGoal(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Progress of every subject that has a weekly goal, over [fromMs, toMs).
 *
 * `scale` stretches the weekly goal to the window: 1 for one week, days / 7
 * for a statistics period of any length. Only real sessions that count toward
 * statistics are summed, clipped to the window, so a session crossing the
 * window edge contributes only its inside minutes.
 */
export function goalProgress(
  events: CalendarEvent[],
  subjects: Subject[],
  fromMs: number,
  toMs: number,
  scale = 1
): GoalProgress[] {
  const withGoal = subjects.filter((s) => (s.weeklyGoalMinutes ?? 0) > 0);
  if (withGoal.length === 0) return [];
  const minutes = new Map<string, number>();
  for (const e of events) {
    if (!countsTowardStats(e)) continue;
    const s = Math.max(new Date(e.start).getTime(), fromMs);
    const en = Math.min(new Date(e.end).getTime(), toMs);
    if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue;
    minutes.set(e.subjectId, (minutes.get(e.subjectId) || 0) + (en - s) / 60000);
  }
  return withGoal.map((s) => {
    const goal = Math.round((s.weeklyGoalMinutes as number) * scale);
    const done = Math.round(minutes.get(s.id) || 0);
    return {
      subjectId: s.id,
      name: s.name,
      color: s.color,
      goalMinutes: goal,
      minutes: done,
      percent: goal > 0 ? (done / goal) * 100 : 0,
    };
  });
}

/**
 * Goal progress of the week containing `date`, as it stood at the end of that
 * day: from its Monday 00:00 up to midnight after `date`. Every Monday starts
 * from zero, and each later day adds its own sessions on top, so stepping
 * through past days replays how the week filled up.
 */
export function weeklyGoalProgress(events: CalendarEvent[], subjects: Subject[], date: Date): GoalProgress[] {
  const from = startOfWeek(date);
  return goalProgress(events, subjects, from.getTime(), addDays(startOfDay(date), 1).getTime());
}
