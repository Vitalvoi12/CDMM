import type { TaskStats } from '../../utils/analytics';
import { EmptyState, Section, StatTile } from './StatParts';

interface TaskStatsPanelProps {
  stats: TaskStats;
  periodLabel: string;
}

/**
 * Todo throughput for the period. The cohort is "tasks created inside the
 * period" — created, done, still open and overdue all describe that same set,
 * while "completed" and the deadline split are measured by completion time.
 */
export function TaskStatsPanel({ stats, periodLabel }: TaskStatsPanelProps) {
  if (stats.created === 0) {
    return (
      <Section title="Tasks" delay={400}>
        <EmptyState
          text="No tasks created in this period"
          hint={`Nothing was added to the todo list during ${periodLabel}.`}
        />
      </Section>
    );
  }

  const done = stats.created - stats.stillOpen;
  const ratePercent = Math.round(stats.completionRate * 100);
  const onTimePercent = stats.withDeadline > 0 ? (stats.onTime / stats.withDeadline) * 100 : 0;

  return (
    <Section
      title="Tasks"
      delay={400}
      aside={
        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
          {done} / {stats.created} done
        </p>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatTile value={`${stats.created}`} label="Created" delay={440} />
        <StatTile value={`${stats.completed}`} label="Completed" hint="finished in period" delay={500} />
        <StatTile value={`${ratePercent}%`} label="Done" hint={`${done} of ${stats.created}`} delay={560} />
        <StatTile
          value={`${stats.overdue}`}
          label="Overdue"
          hint={`${stats.stillOpen} still open`}
          delay={620}
        />
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5 flex flex-col gap-6">
        <div>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Completion
            </span>
            <span className="font-label-sm text-label-sm text-on-surface tabular-nums">
              {ratePercent}%
            </span>
          </div>
          <div className="h-1.5 bg-surface-variant rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary origin-left animate-bar-grow-x"
              style={{ width: `${ratePercent}%` }}
            />
          </div>
        </div>

        {stats.withDeadline > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
                Deadline
              </span>
              <span className="font-label-sm text-label-sm text-on-surface tabular-nums">
                {stats.onTime} on time · {stats.late} late
              </span>
            </div>
            <div className="flex h-1.5 bg-surface-variant rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${onTimePercent}%` }}
              />
              <div
                className="h-full bg-surface-container-highest"
                style={{ width: `${100 - onTimePercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
