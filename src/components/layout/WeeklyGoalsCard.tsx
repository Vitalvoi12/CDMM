import { useCallback, useState } from 'react';
import { eventRepo, subjectRepo } from '../../services/repositories';
import { useSyncRefresh } from '../../hooks/useServerSync';
import { formatGoal, weeklyGoalProgress } from '../../utils/goals';
import { formatDuration } from '../../utils/time';

function readGoals() {
  return weeklyGoalProgress(eventRepo.getAll(), subjectRepo.getAll(), new Date());
}

/**
 * This week's goal progress, compact, in the desktop sidebar — always in view
 * whatever page is open. Counts finished sessions; the running one joins when
 * it is finished (the calendar's Stat panel shows it live). Hidden while no
 * subject has a goal.
 */
export function WeeklyGoalsCard() {
  const [goals, setGoals] = useState(readGoals);
  useSyncRefresh(useCallback(() => setGoals(readGoals()), []));

  if (goals.length === 0) return null;

  return (
    <div className="rounded-2xl border border-outline-variant px-5 py-4 flex flex-col gap-3">
      <span className="font-label-sm text-label-sm tracking-[0.18em] opacity-60">Weekly goals</span>
      <ul className="flex flex-col gap-2.5">
        {goals.map((g) => (
          <li key={g.subjectId} title={`${g.name}: ${formatDuration(g.minutes)} of ${formatGoal(g.goalMinutes)} this week`}>
            <div className="flex justify-between items-baseline gap-2 mb-1">
              <span className="font-body-sm text-body-sm text-on-surface truncate">{g.name}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums flex-shrink-0">
                {formatDuration(g.minutes)} / {formatGoal(g.goalMinutes)}
              </span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, g.percent)}%`, backgroundColor: g.color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
