import type { Subject } from '../../types';
import { formatDuration } from '../../utils/time';
import { calculateSubjectStats } from '../../utils/stats';
import type { CalendarEvent } from '../../types';
import { formatGoal, type GoalProgress } from '../../utils/goals';

interface StatsSidebarProps {
  events: CalendarEvent[];
  subjects: Subject[];
  totalMinutes: number;
  /** Weekly goal progress for the week of the displayed day (empty = no goals set). */
  goals?: GoalProgress[];
}

export function StatsSidebar({ events, subjects, totalMinutes, goals = [] }: StatsSidebarProps) {
  const subjectMap: Record<string, Subject> = {};
  subjects.forEach((s) => (subjectMap[s.id] = s));

  const subjectStats = calculateSubjectStats(events, totalMinutes);

  // Plan vs real per subject for the displayed day:
  // percent = real minutes (subject) / plan minutes (subject) * 100.
  // The stats flag drops the event from whichever side it belongs to: a real
  // event leaves the numerator, a planned one leaves the plan sum (plans
  // never touch Total Focus Time).
  const planBySubject: Record<string, number> = {};
  const realBySubject: Record<string, number> = {};
  let totalPlan = 0;
  for (const e of events) {
    if (e.countInStats === false) continue;
    const mins = Math.max(0, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000));
    if (e.kind === 'plan') {
      planBySubject[e.subjectId] = (planBySubject[e.subjectId] || 0) + mins;
      totalPlan += mins;
    } else {
      realBySubject[e.subjectId] = (realBySubject[e.subjectId] || 0) + mins;
    }
  }
  const planStats = [...new Set([...Object.keys(planBySubject), ...Object.keys(realBySubject)])]
    .map((subjectId) => {
      const plan = planBySubject[subjectId] || 0;
      const real = realBySubject[subjectId] || 0;
      return {
        subjectId,
        planMinutes: plan,
        realMinutes: real,
        percentage: plan > 0 ? Math.round((real / plan) * 100) : 0,
        hasPlan: plan > 0,
      };
    })
    .sort((a, b) => b.planMinutes + b.realMinutes - (a.planMinutes + a.realMinutes));

  return (
    // Fixed to its column with an internal scroll: tall content must never
    // push the card past the floating action bar, at any zoom level.
    <aside className="col-span-12 lg:col-span-4 min-h-0 max-lg:mt-1 flex-1 flex flex-col">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-6 max-lg:p-4 flex flex-col gap-6 max-lg:gap-3 flex-1 min-h-0 overflow-y-auto">
        {/* Total Time */}
        <div>
          <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em] mb-1">
            Total Focus Time
          </h2>
          <div className="font-display-lg text-display-lg max-lg:!text-[22px] max-lg:leading-none text-on-surface tabular-nums">
            {formatDuration(totalMinutes)}
          </div>
        </div>

        <hr className="border-t border-outline-variant" />

        {/* Weekly goals: real time this week against each subject's goal */}
        {goals.length > 0 && (
          <>
            <div>
              <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em] mb-4 max-lg:mb-2">
                Weekly goals
              </h2>
              <ul className="flex flex-col gap-4 max-lg:gap-2">
                {goals.map((g) => (
                  <li key={g.subjectId}>
                    <div className="flex justify-between items-baseline mb-1.5 max-lg:mb-1">
                      <span className="font-body-md text-body-md max-lg:!text-[10px] max-lg:leading-none text-on-surface flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                        <span className="truncate">{g.name}</span>
                      </span>
                      <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
                        {formatDuration(g.minutes)} / {formatGoal(g.goalMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${Math.min(100, g.percent)}%`, backgroundColor: g.color }}
                        />
                      </div>
                      <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant tabular-nums w-10 text-right flex-shrink-0">
                        {g.percent >= 100 ? (
                          <span className="material-symbols-outlined text-[14px] max-lg:text-[10px] leading-none align-middle" aria-label="Goal reached">check</span>
                        ) : (
                          `${Math.round(g.percent)}%`
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <hr className="border-t border-outline-variant" />
          </>
        )}

        {/* Plan vs real for the displayed day */}
        {planStats.length > 0 && (
          <>
            <div>
              <div className="flex justify-between items-baseline mb-4 max-lg:mb-2">
                <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
                  Plan
                </h2>
                <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
                  {formatDuration(totalPlan)} planned
                </span>
              </div>
              <ul className="flex flex-col gap-4 max-lg:gap-2">
                {planStats.map((stat) => {
                  const subject = subjectMap[stat.subjectId];
                  const color = subject?.color || '#6e7e85';
                  return (
                    <li key={stat.subjectId}>
                      <div className="flex justify-between items-baseline mb-1.5 max-lg:mb-1">
                        <span className="font-body-md text-body-md max-lg:!text-[10px] max-lg:leading-none text-on-surface flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="truncate">{subject?.name || stat.subjectId || 'No subject'}</span>
                        </span>
                        <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
                          {formatDuration(stat.realMinutes)} / {formatDuration(stat.planMinutes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-surface-container-high rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, stat.percentage)}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant tabular-nums w-10 text-right flex-shrink-0">
                          {stat.hasPlan ? `${stat.percentage}%` : '—'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <hr className="border-t border-outline-variant" />
          </>
        )}

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
                const color = subject?.color || '#6e7e85';
                const barWidth = totalMinutes > 0 ? Math.round((stat.minutes / totalMinutes) * 100) : 0;
                return (
                  <li key={stat.subjectId}>
                    <div className="flex justify-between items-baseline mb-1.5 max-lg:mb-1">
                      <span className="font-body-md text-body-md max-lg:!text-[10px] max-lg:leading-none text-on-surface flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate">{subject?.name || stat.subjectId || 'No subject'}</span>
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
