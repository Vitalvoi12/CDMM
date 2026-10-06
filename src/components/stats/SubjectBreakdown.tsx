import { formatDuration, formatDurationLong } from '../../utils/time';
import type { SubjectRow } from '../../hooks/useStatisticsPeriod';
import type { SubjectMetric } from '../../hooks/useStatisticsPeriod';
import { EmptyState, Section, anchorOf, Tooltip } from './StatParts';
import { Segmented } from './Segmented';
import { useState } from 'react';

interface SubjectBreakdownProps {
  rows: SubjectRow[];
  metric: SubjectMetric;
  onMetricChange: (metric: SubjectMetric) => void;
  totalMinutes: number;
  totalSessions: number;
  periodLabel: string;
}

const METRICS: { id: SubjectMetric; label: string }[] = [
  { id: 'time', label: 'Time' },
  { id: 'share', label: 'Share' },
];

const METRIC_HINT: Record<SubjectMetric, string> = {
  time: 'Studied time per subject, as a percentage of that subject’s own plan',
  share: 'Share of the studied time',
};

/**
 * The headline block: what the period was actually spent on.
 *
 * One component serves both metrics — only the number in the value column
 * and the unit of the bar change — so the two views stay recognisably the
 * same object instead of three separate designs.
 *
 * The Time view answers "did I study what I planned for this subject": its
 * percentage is real time over THIS subject's plan, not over the period's
 * total, so an unprepared-for subject and a heavily planned one are judged
 * against their own plans. Share keeps the old meaning — each subject's slice
 * of everything studied in the period.
 */
export function SubjectBreakdown({
  rows,
  metric,
  onMetricChange,
  totalMinutes,
  totalSessions,
  periodLabel,
}: SubjectBreakdownProps) {
  const [hover, setHover] = useState<{ row: SubjectRow; x: number; y: number; below: boolean } | null>(
    null
  );

  if (rows.length === 0) {
    return (
      <Section
        title="Subjects"
        delay={80}
        aside={
          <Segmented options={METRICS} value={metric} onChange={onMetricChange} ariaLabel="Subject metric" />
        }
      >
        <EmptyState
          text="No focus sessions in this period"
          hint={`Nothing was studied between ${periodLabel}. Finished Focus Room sessions show up here.`}
        />
      </Section>
    );
  }

  // Each metric puts a different pair in the two columns, but never the same
  // number twice: SHARE leads with the percentage and falls back to the time.
  const value = (row: SubjectRow) => {
    if (metric === 'share') return `${Math.round(row.timeShare)}%`;
    return formatDurationLong(row.minutes);
  };
  const secondary = (row: SubjectRow) => {
    if (metric === 'share') return formatDurationLong(row.minutes);
    // No plan for this subject → the percentage would be meaningless, say so.
    if (row.planShare === null) return '—';
    return `${Math.round(row.planShare)}%`;
  };

  return (
    <Section
      title="Subjects"
      delay={80}
      aside={
        <Segmented options={METRICS} value={metric} onChange={onMetricChange} ariaLabel="Subject metric" />
      }
    >
      <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 overflow-hidden">
        {/* Share is the one view that wants a single continuous bar, so the
            distribution is visible as a whole before the rows break it down. */}
        {metric === 'share' && (
          <div className="px-5 pt-5">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-variant">
              {rows.map((row) => (
                <div
                  key={row.subjectId}
                  className="h-full"
                  style={{ width: `${row.timeShare}%`, backgroundColor: row.color }}
                />
              ))}
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
              {formatDuration(totalMinutes)} across {totalSessions} session
              {totalSessions === 1 ? '' : 's'}
            </p>
          </div>
        )}

        <div className="p-5 flex flex-col gap-5">
          {rows.map((row, i) => (
            <div
              key={row.subjectId}
              className="group animate-fade-up"
              style={{ animationDelay: `${Math.min(i * 60, 420)}ms` }}
              onMouseEnter={(e) => setHover({ row, ...anchorOf(e.currentTarget as HTMLElement) })}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="font-body-md text-body-md text-on-surface font-medium truncate">
                    {row.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-4 flex-shrink-0">
                  <span className="font-label-md text-label-md text-on-surface tabular-nums">
                    {value(row)}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums w-16 text-right">
                    {secondary(row)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-surface-variant rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full origin-left animate-bar-grow-x group-hover:scale-x-[1.02] transition-transform"
                  style={{ width: `${row.barWidth}%`, backgroundColor: row.color, animationDelay: `${Math.min(i * 60, 420)}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant mt-3">{METRIC_HINT[metric]}</p>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} below={hover.below}>
          <p className="font-label-sm text-label-sm font-semibold whitespace-nowrap">{hover.row.name}</p>
          <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
            {formatDuration(hover.row.minutes)} · {hover.row.sessions} session
            {hover.row.sessions === 1 ? '' : 's'}
          </p>
          {hover.row.planMinutes > 0 && (
            <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
              {formatDuration(hover.row.planMinutes)} planned
            </p>
          )}
        </Tooltip>
      )}
    </Section>
  );
}
