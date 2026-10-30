import type { GoalProgress } from '../../utils/goals';
import { formatGoal } from '../../utils/goals';
import { formatDurationLong } from '../../utils/time';
import { Foot, Section, type StatLayout } from './StatParts';
import { boxClass } from './statLayout';

interface GoalsPanelProps {
  goals: GoalProgress[];
  /** Period length in days — the goal target is the weekly goal × days / 7. */
  days: number;
  layout?: StatLayout;
}

/**
 * Each subject's weekly goal against the period. The target scales with the
 * period, so "7 days" reads as one week and "30 days" as about four. Hidden
 * entirely while no subject has a goal — set one on the Subjects page.
 */
export function GoalsPanel({ goals, days, layout = 'section' }: GoalsPanelProps) {
  if (goals.length === 0) return null;
  const weeks = days / 7;
  const reached = goals.filter((g) => g.percent >= 100).length;

  return (
    <Section
      title="Goals"
      delay={120}
      layout={layout}
      wide
      aside={
        <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums">
          {reached}/{goals.length} reached
          {Math.abs(weeks - 1) > 0.01 && ` · target × ${Math.round(weeks * 10) / 10} weeks`}
        </span>
      }
    >
      <div className={boxClass(layout, `flex flex-col ${layout === 'card' ? 'gap-4' : 'gap-5'}`)}>
        {goals.map((g, i) => (
          <div key={g.subjectId} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 60, 420)}ms` }}>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="font-body-md text-body-md text-on-surface font-medium truncate">{g.name}</span>
              </div>
              <div className="flex items-baseline gap-4 flex-shrink-0">
                <span className="font-label-md text-label-md text-on-surface tabular-nums">
                  {formatDurationLong(g.minutes)} / {formatGoal(g.goalMinutes)}
                </span>
                <span
                  className={`font-label-sm text-label-sm tabular-nums w-12 text-right ${
                    g.percent >= 100 ? 'text-primary font-semibold' : 'text-on-surface-variant'
                  }`}
                >
                  {Math.round(g.percent)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-surface-variant rounded-full overflow-hidden">
              <div
                className="h-full rounded-full origin-left animate-bar-grow-x"
                style={{ width: `${Math.min(100, g.percent)}%`, backgroundColor: g.color, animationDelay: `${Math.min(i * 60, 420)}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
      <Foot layout={layout}>Real focus time against each subject’s weekly goal, scaled to the period</Foot>
    </Section>
  );
}
