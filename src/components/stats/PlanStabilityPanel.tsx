import type { PlanStability, PlanStabilityEvent } from '../../utils/analytics';
import type { Subject } from '../../types';
import { EmptyState, Section, StatTile } from './StatParts';
import { formatDuration } from '../../utils/time';

interface PlanStabilityPanelProps {
  stats: PlanStability;
  subjectMap: Record<string, Subject>;
  periodLabel: string;
}

/** How a block drifted: moved to another hour, stretched, or both. */
function driftLabel(row: PlanStabilityEvent): string {
  const parts: string[] = [];
  if (row.startShiftMinutes !== 0) {
    const abs = Math.abs(row.startShiftMinutes);
    const body = abs < 60 ? `${abs}m` : formatDuration(abs);
    parts.push(row.startShiftMinutes > 0 ? `+${body} later` : `${body} earlier`);
  }
  if (row.durationShiftMinutes !== 0) {
    const abs = Math.abs(row.durationShiftMinutes);
    const body = abs < 60 ? `${abs}m` : formatDuration(abs);
    parts.push(row.durationShiftMinutes > 0 ? `+${body} longer` : `${body} shorter`);
  }
  return parts.length > 0 ? parts.join(', ') : 'same slot';
}

/**
 * How much the schedule had to be corrected after it was made.
 *
 * This is deliberately not a score: the meter is only a visual echo of the
 * share of blocks that moved, and the four figures underneath it are the
 * actual measurement — the same numbers the meter is drawn from.
 *
 * Counted: a block moved to another day or hour, stretched, or otherwise
 * rescheduled. Not counted: swapping the tasks inside a block, a new title, a
 * different colour — anything that leaves the block's slot alone.
 */
export function PlanStabilityPanel({ stats, subjectMap, periodLabel }: PlanStabilityPanelProps) {
  if (stats.timeChanges === 0) {
    return (
      <Section title="Plan stability" delay={480}>
        <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5 flex flex-col gap-4">
          <EmptyState
            text="No time changes in this period"
            hint={
              stats.scheduledEvents > 0
                ? `All ${stats.scheduledEvents} block${stats.scheduledEvents === 1 ? '' : 's'} of ${periodLabel} kept the time they were given.`
                : `No events were scheduled in ${periodLabel}.`
            }
          />
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Moving or resizing a block is what this section measures; editing the
            tasks inside one is not counted.
          </p>
        </div>
      </Section>
    );
  }

  const sharePercent = Math.round(stats.changedShare * 100);

  return (
    <Section title="Plan stability" delay={480}>
      <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5 flex flex-col gap-6">
        <div>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-widest">
              {sharePercent <= 15
                ? 'Stable'
                : sharePercent <= 35
                  ? 'Mostly stable'
                  : sharePercent <= 60
                    ? 'Often corrected'
                    : 'Reworked a lot'}
            </span>
            <span className="font-label-md text-label-md text-on-surface tabular-nums">
              {stats.stability}% kept
            </span>
          </div>
          {/* Filled from the left = kept its time; the tail = had to be moved. */}
          <div className="h-2 w-full rounded-full bg-on-surface/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary origin-left animate-bar-grow-x"
              style={{ width: `${stats.stability}%` }}
            />
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
            {stats.changedEvents} of {stats.scheduledEvents} planned block
            {stats.scheduledEvents === 1 ? '' : 's'} ended up at a different time.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          <StatTile value={`${stats.timeChanges}`} label="Time changes" delay={520} />
          <StatTile value={`${stats.changedEvents}`} label="Blocks moved" delay={560} />
          <StatTile
            value={`${sharePercent}%`}
            label="Rescheduled"
            hint={`of ${stats.scheduledEvents} blocks`}
            delay={600}
          />
        </div>

        {stats.top.length > 0 && (
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-3">
              Most rescheduled
            </p>
            <div className="flex flex-col gap-2">
              {stats.top.slice(0, 5).map((row) => {
                const subject = subjectMap[row.subjectId];
                const color = subject?.color || 'var(--color-on-surface-variant)';
                return (
                  <div
                    key={row.eventId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-b border-outline-variant/60 last:border-b-0"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-body-sm text-body-sm text-on-surface truncate flex-1 min-w-0">
                      {row.title || 'Untitled block'}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums flex-shrink-0 whitespace-nowrap">
                      {row.changes} change{row.changes === 1 ? '' : 's'}
                    </span>
                    {/* Drops onto its own line on a phone, where three columns
                        would squeeze the title into nothing. */}
                    <span className="w-full sm:w-44 font-label-sm text-label-sm text-on-surface-variant tabular-nums sm:text-right whitespace-nowrap">
                      {driftLabel(row)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Counts every change of a planned block's time — a different day, start,
          end or duration. Changing the tasks, title or colour inside a block is
          not a reschedule, and finished focus sessions are not part of the plan
          {stats.trackedSince
            ? ` · tracking since ${new Date(stats.trackedSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
            : ''}
          .
        </p>
      </div>
    </Section>
  );
}
