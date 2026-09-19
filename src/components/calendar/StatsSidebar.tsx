import type { Subject } from '../../types';
import { formatDuration } from '../../utils/time';
import { calculateSubjectStats } from '../../utils/stats';
import type { CalendarEvent } from '../../types';

interface StatsSidebarProps {
  events: CalendarEvent[];
  subjects: Subject[];
  totalMinutes: number;
  dailyGoalMinutes: number;
}

export function StatsSidebar({ events, subjects, totalMinutes, dailyGoalMinutes }: StatsSidebarProps) {
  const subjectMap: Record<string, Subject> = {};
  subjects.forEach((s) => (subjectMap[s.id] = s));

  const subjectStats = calculateSubjectStats(events, totalMinutes);
  const goalPercent = dailyGoalMinutes > 0 ? Math.min(Math.round((totalMinutes / dailyGoalMinutes) * 100), 100) : 0;
  const toGo = Math.max(dailyGoalMinutes - totalMinutes, 0);

  return (
    <aside className="col-span-12 lg:col-span-4 min-h-0 overflow-y-auto max-lg:mt-1">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 max-lg:p-4 flex flex-col gap-6 max-lg:gap-3">
        {/* Total Time */}
        <div>
          <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em] mb-1">
            Total Focus Time
          </h2>
          <div className="font-display-lg text-display-lg max-lg:!text-[22px] max-lg:leading-none text-on-surface tabular-nums">
            {formatDuration(totalMinutes)}
          </div>
        </div>

        {/* Goal Progress */}
        <div>
          <div className="flex justify-between items-baseline mb-2 max-lg:mb-1">
            <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
              Daily Goal {formatDuration(dailyGoalMinutes)}
            </h2>
            <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant tabular-nums">
              {goalPercent}%
            </span>
          </div>
          <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${goalPercent}%` }}
            />
          </div>
          <p className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em] mt-2">
            {toGo > 0 ? `${formatDuration(toGo)} to go` : 'Goal reached'}
          </p>
        </div>

        <hr className="border-t border-outline-variant" />

        {/* Subject Distribution */}
        <div>
          <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em] mb-4 max-lg:mb-2">
            Subject Distribution
          </h2>
          {subjectStats.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">No sessions yet</p>
          ) : (
            <ul className="flex flex-col gap-4 max-lg:gap-2">
              {subjectStats.map((stat) => {
                const subject = subjectMap[stat.subjectId];
                const color = subject?.color || '#b3a98f';
                const barWidth = totalMinutes > 0 ? Math.round((stat.minutes / totalMinutes) * 100) : 0;
                return (
                  <li key={stat.subjectId}>
                    <div className="flex justify-between items-baseline mb-1.5 max-lg:mb-1">
                      <span className="font-body-md text-body-md max-lg:!text-[10px] max-lg:leading-none text-on-surface flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate">{subject?.name || stat.subjectId}</span>
                      </span>
                      <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
                        {formatDuration(stat.minutes)}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${barWidth}%`, backgroundColor: color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
