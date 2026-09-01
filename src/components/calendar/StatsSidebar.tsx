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
  const goalPercent = Math.min(Math.round((totalMinutes / dailyGoalMinutes) * 100), 100);

  return (
    <aside className="col-span-12 lg:col-span-4 flex flex-col gap-8 max-lg:gap-3 max-lg:mt-1">
      {/* Total Time */}
      <div>
        <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] max-lg:tracking-normal text-on-surface-variant uppercase tracking-widest mb-1">
          Total Focus Time
        </h2>
        <div className="font-display-lg text-display-lg max-lg:!text-[24px] max-lg:leading-none text-on-background">
          {formatDuration(totalMinutes)}
        </div>
      </div>

      {/* Goal Progress */}
      <div>
        <div className="flex justify-between items-baseline mb-2 max-lg:mb-1">
          <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] max-lg:tracking-normal text-on-surface-variant uppercase tracking-widest">
            Daily Goal
          </h2>
          <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-background">
            {goalPercent}% of {formatDuration(dailyGoalMinutes)}
          </span>
        </div>
        <div className="w-full h-px bg-outline-variant relative">
          <div
            className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${goalPercent}%` }}
          />
          <div className="absolute -top-1 left-full w-px h-3 bg-on-background" />
        </div>
      </div>

      <hr className="border-t border-outline-variant my-4 max-lg:my-2" />

      {/* Subject Distribution */}
      <div>
        <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] max-lg:tracking-normal text-on-surface-variant uppercase tracking-widest mb-6 max-lg:mb-2">
          Subject Distribution
        </h2>
        <ul className="flex flex-col gap-4 max-lg:gap-2">
          {subjectStats.map((stat) => {
            const subject = subjectMap[stat.subjectId];
            const barWidth = Math.round((stat.minutes / totalMinutes) * 100);
            return (
              <li key={stat.subjectId} className="group">
                <div className="flex justify-between items-baseline mb-1 max-lg:mb-0.5">
                  <span className="font-label-md text-label-md max-lg:!text-[10px] max-lg:leading-none text-on-background group-hover:text-primary transition-colors">
                    {subject?.name || stat.subjectId}
                  </span>
                  <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant">
                    {formatDuration(stat.minutes)}
                  </span>
                </div>
                <div className="w-full h-px bg-outline-variant relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
