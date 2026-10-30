import type { CalendarEvent, Subject } from '../../types';
import { formatDuration } from '../../utils/time';
import { calculatePlanStats } from '../../utils/stats';

interface TodayStatsProps {
  /** The shown day's events, the running session included. */
  events: CalendarEvent[];
  subjects: Subject[];
  /** Real time that counts toward stats on the shown day. */
  totalMinutes: number;
}

/**
 * Desktop day view, top of the side column: the day's real time against its
 * plan, then one row per subject that has a plan or real time that day.
 * Weekly goals live in the sidebar card, so they are not repeated here.
 */
export function TodayStats({ events, subjects, totalMinutes }: TodayStatsProps) {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const { stats, totalPlan } = calculatePlanStats(events);
  const dayPercent = totalPlan > 0 ? Math.round((totalMinutes / totalPlan) * 100) : null;

  return (
    <section
      aria-label="Today's focus"
      className="flex-none bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-6 flex flex-col gap-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-label-sm text-label-sm text-on-surface-variant tracking-[0.16em]">Today</h2>
        <p className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-headline-md text-headline-md text-on-surface tabular-nums">{formatDuration(totalMinutes)}</span>
          {dayPercent !== null && (
            <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums whitespace-nowrap">
              / {formatDuration(totalPlan)} · {dayPercent}%
            </span>
          )}
        </p>
      </div>

      {stats.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {stats.map((stat) => {
            const subject = subjectMap.get(stat.subjectId);
            const color = subject?.color || '#8A857C';
            const name = subject?.name || stat.subjectId || 'No subject';
            const reached = stat.hasPlan && stat.percentage >= 100;
            const value = `${formatDuration(stat.realMinutes)} / ${stat.hasPlan ? formatDuration(stat.planMinutes) : '—'}`;
            return (
              <li
                key={stat.subjectId}
                title={`${name}: ${value}${stat.hasPlan ? (reached ? ' · plan reached' : ` · ${stat.percentage}% of plan`) : ' · no plan'}`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 self-center" style={{ backgroundColor: color }} />
                  <span className="font-body-md text-body-md text-on-surface truncate flex-1 min-w-0">{name}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums flex-shrink-0">{value}</span>
                  <span
                    className={`font-label-sm text-label-sm tabular-nums w-10 text-right flex-shrink-0 ${
                      reached ? 'text-success' : 'text-on-surface-variant'
                    }`}
                  >
                    {reached ? (
                      <span className="material-symbols-outlined text-[14px] leading-none align-middle" aria-label="Plan reached">check</span>
                    ) : stat.hasPlan ? (
                      `${stat.percentage}%`
                    ) : null}
                  </span>
                </div>
                <div className="h-[2px] mt-1.5 bg-surface-container-high rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, stat.percentage)}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
