import { PLAN_FIX_WINDOW_MS, type PlanStability } from '../../utils/analytics';
import type { Subject } from '../../types';
import { EmptyState, Section, StatTile } from './StatParts';
import { formatDuration } from '../../utils/time';

interface PlanStabilityPanelProps {
  stats: PlanStability;
  subjectMap: Record<string, Subject>;
  periodLabel: string;
}

/**
 * How much of the plan survived its own corrections.
 *
 * Everything on this screen is planned TIME. There is deliberately no count of
 * edits: moving a block to another hour does not cost the plan anything, and a
 * block that only got shorter says more about stability than the number of
 * times the calendar was touched.
 */
export function PlanStabilityPanel({ stats, subjectMap, periodLabel }: PlanStabilityPanelProps) {
  if (stats.lostMinutes === 0) {
    return (
      <Section title="Plan stability" delay={480}>
        <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5 flex flex-col gap-4">
          <EmptyState
            text="No planned time was cut away"
            hint={`Nothing was shortened in ${periodLabel} — the plan kept its length.`}
          />
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Only the planned minutes a correction took away count here. Moving a
            block to another hour costs nothing, and swapping tasks, retitling or
            excluding a block from statistics does not count at all.
          </p>
        </div>
      </Section>
    );
  }

  const lostPercent = stats.plannedMinutes > 0
    ? Math.min(100, Math.round((stats.lostMinutes / stats.plannedMinutes) * 100))
    : 100;

  return (
    <Section title="Plan stability" delay={480}>
      <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5 flex flex-col gap-6">
        <div>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-widest">
              {stats.stability >= 95
                ? 'Stable'
                : stats.stability >= 75
                  ? 'Mostly stable'
                  : stats.stability >= 40
                    ? 'Often trimmed'
                    : 'Reworked a lot'}
            </span>
            <span className="font-label-md text-label-md text-on-surface tabular-nums">
              {stats.stability}% kept
            </span>
          </div>
          {/* Filled = planned time that survived; the tail = what was cut away. */}
          <div className="h-2 w-full rounded-full bg-on-surface/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary origin-left animate-bar-grow-x"
              style={{ width: `${stats.stability}%` }}
            />
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
            {formatDuration(stats.lostMinutes)} of {formatDuration(stats.plannedMinutes)} planned was
            cut away ({lostPercent}%).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <StatTile
            value={formatDuration(stats.lostMinutes)}
            label="Lost time"
            hint="planned minutes cut"
            delay={520}
          />
          <StatTile
            value={formatDuration(stats.plannedMinutes)}
            label="Planned"
            hint="before corrections"
            delay={560}
          />
        </div>

        {stats.bySubject.length > 0 && (
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-3">
              Lost time by subject
            </p>
            <div className="flex flex-col gap-2">
              {stats.bySubject.map((row) => {
                const subject = subjectMap[row.subjectId];
                const color = subject?.color || 'var(--color-on-surface-variant)';
                const percent = stats.plannedMinutes > 0
                  ? Math.min(100, (row.lostMinutes / stats.plannedMinutes) * 100)
                  : 0;
                return (
                  <div key={row.subjectId || 'none'}>
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-body-sm text-body-sm text-on-surface truncate">
                          {subject?.name || 'No subject'}
                        </span>
                      </div>
                      <span className="font-label-sm text-label-sm text-on-surface tabular-nums flex-shrink-0">
                        −{formatDuration(row.lostMinutes)}
                      </span>
                    </div>
                    <div className="h-1 bg-surface-variant rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full origin-left animate-bar-grow-x"
                        style={{ width: `${percent}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {stats.top.length > 0 && (
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-3">
              Largest losses
            </p>
            <div className="flex flex-col">
              {stats.top.slice(0, 5).map((row) => {
                const subject = subjectMap[row.subjectId];
                const color = subject?.color || 'var(--color-on-surface-variant)';
                return (
                  <div
                    key={row.eventId}
                    className="flex items-center gap-3 py-2 border-b border-outline-variant/60 last:border-b-0"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-body-sm text-body-sm text-on-surface truncate flex-1 min-w-0">
                      {row.title || 'Untitled block'}
                    </span>
                    {row.deleted && (
                      <span className="font-label-sm text-label-sm text-on-surface-variant flex-shrink-0">
                        deleted
                      </span>
                    )}
                    <span className="font-label-md text-label-md text-on-surface tabular-nums flex-shrink-0 w-20 text-right whitespace-nowrap ml-auto">
                      −{formatDuration(row.lostMinutes)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          A block's length is fixed {Math.round(PLAN_FIX_WINDOW_MS / 60000)}{' '}
          minutes after it is created, and from then on two things cost plan
          time: shortening it and deleting it. Moving it to another hour costs
          nothing, and swapping tasks, retitling or excluding it from statistics
          does not count at all
          {stats.trackedSince
            ? ` · tracking since ${new Date(stats.trackedSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
            : ''}
          .
        </p>
      </div>
    </Section>
  );
}