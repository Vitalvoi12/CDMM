import type { CalendarEvent, Subject } from '../../types';
import { calculateSubjectStats, countsTowardStats } from '../../utils/stats';
import { formatDuration, minutesBetween } from '../../utils/time';
import { formatGoal, type GoalProgress } from '../../utils/goals';

interface DayStatsProps {
  /** The day's events, the running session's part of it included. */
  events: CalendarEvent[];
  subjects: Subject[];
  totalMinutes: number;
  goals: GoalProgress[];
  /** Minutes of the running session inside this day (0 when none). */
  liveMinutes: number;
  /** Subject of the running session, for its Live tag. */
  liveSubjectId: string | null;
  streak: number;
  isToday: boolean;
}

function Bar({ label, color, value, percent, live = false }: { label: string; color: string; value: string; percent: number; live?: boolean }) {
  return (
    <li className="flex flex-col" style={{ gap: 4 }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span className="flex items-center min-w-0" style={{ gap: 8 }}>
          <span className="m-sw" style={{ background: color }} />
          <span className="m-tr">{label}</span>
          {live && <span className="m-lbl" style={{ color: 'var(--color-now)' }}>Live</span>}
        </span>
        <span className="m-sm m-mut m-num flex-none">{value}</span>
      </div>
      <span className="m-bar">
        <i style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }} />
      </span>
    </li>
  );
}

/**
 * The phone's Stat tab: the day's focus total, sessions / longest / streak,
 * time by subject, the week's goals and plan against real.
 */
export function DayStats({ events, subjects, totalMinutes, goals, liveMinutes, liveSubjectId, streak, isToday }: DayStatsProps) {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const counted = events.filter(countsTowardStats);
  const longest = counted.reduce((m, e) => Math.max(m, minutesBetween(e.start, e.end)), 0);
  const bySubject = calculateSubjectStats(events, totalMinutes);
  const top = bySubject[0]?.minutes || 0;

  // Plan vs real per subject — the same sums the desktop Stat panel shows.
  const plan: Record<string, number> = {};
  const real: Record<string, number> = {};
  let totalPlan = 0;
  for (const e of events) {
    if (e.countInStats === false) continue;
    const mins = Math.max(0, minutesBetween(e.start, e.end));
    if (e.kind === 'plan') {
      plan[e.subjectId] = (plan[e.subjectId] || 0) + mins;
      totalPlan += mins;
    } else {
      real[e.subjectId] = (real[e.subjectId] || 0) + mins;
    }
  }
  const planned = Object.keys(plan).sort((a, b) => plan[b] - plan[a]);
  const nameOf = (id: string, fallback?: string) => byId.get(id)?.name || fallback || 'No subject';
  const colorOf = (id: string) => byId.get(id)?.color || 'var(--color-outline)';
  const eventTitle = (id: string) => events.find((e) => e.subjectId === id)?.title;

  return (
    <div className="flex flex-col" style={{ padding: '8px 16px 24px', gap: 18 }}>
      <div className="flex flex-col" style={{ gap: 2 }}>
        <span className="m-lbl m-mut">{isToday ? 'Focus today' : 'Focus this day'}</span>
        <span className="m-dsp m-num">{formatDuration(totalMinutes)}</span>
        {liveMinutes > 0 && <span className="m-sm m-mut">incl. {formatDuration(liveMinutes)} of the running session</span>}
      </div>

      <div className="grid grid-cols-3" style={{ gap: 12 }}>
        <div className="m-tile"><span className="m-lbl m-mut">Sessions</span><b className="m-num">{counted.filter((e) => e.kind !== 'plan').length}</b></div>
        <div className="m-tile"><span className="m-lbl m-mut">Longest</span><b className="m-num m-tr">{longest > 0 ? formatDuration(longest) : '—'}</b></div>
        <div className="m-tile"><span className="m-lbl m-mut">Streak</span><b className="m-num">{streak} d</b></div>
      </div>

      <section className="flex flex-col" style={{ gap: 12 }}>
        <span className="m-lbl m-mut">By subject</span>
        {bySubject.length === 0 ? (
          <span className="m-sm m-mut">No sessions yet</span>
        ) : (
          <ul className="flex flex-col" style={{ gap: 12 }}>
            {bySubject.map((s) => (
              <Bar
                key={s.subjectId}
                label={nameOf(s.subjectId, eventTitle(s.subjectId))}
                color={colorOf(s.subjectId)}
                value={formatDuration(s.minutes)}
                percent={top > 0 ? (s.minutes / top) * 100 : 0}
                live={liveMinutes > 0 && s.subjectId === (liveSubjectId ?? '')}
              />
            ))}
          </ul>
        )}
      </section>

      {goals.length > 0 && (
        <section className="flex flex-col" style={{ gap: 12 }}>
          <span className="m-lbl m-mut">Weekly goals</span>
          <ul className="flex flex-col" style={{ gap: 12 }}>
            {goals.map((g) => (
              <Bar
                key={g.subjectId}
                label={g.name}
                color={g.color}
                value={`${formatDuration(g.minutes)} / ${formatGoal(g.goalMinutes)}${g.percent >= 100 ? ' ✓' : ''}`}
                percent={g.percent}
              />
            ))}
          </ul>
        </section>
      )}

      {planned.length > 0 && (
        <section className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex items-center justify-between">
            <span className="m-lbl m-mut">Plan</span>
            <span className="m-sm m-mut m-num">{formatDuration(totalPlan)} planned</span>
          </div>
          <ul className="flex flex-col" style={{ gap: 12 }}>
            {planned.map((id) => (
              <Bar
                key={id}
                label={nameOf(id, eventTitle(id))}
                color={colorOf(id)}
                value={`${formatDuration(real[id] || 0)} / ${formatDuration(plan[id])} · ${Math.round(((real[id] || 0) / plan[id]) * 100)}%`}
                percent={((real[id] || 0) / plan[id]) * 100}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
