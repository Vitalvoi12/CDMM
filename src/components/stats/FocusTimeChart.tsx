import { useState } from 'react';
import { formatDuration, formatDurationLong } from '../../utils/time';
import type { BucketSize, FocusBucket } from '../../utils/analytics';
import { useIsMobile } from '../../hooks/useIsMobile';
import { EmptyState, Section, anchorOf, Tooltip } from './StatParts';

interface FocusTimeChartProps {
  buckets: FocusBucket[];
  size: BucketSize;
  /** Average minutes per bucket, drawn as the reference line. */
  averageMinutes: number;
  totalMinutes: number;
  totalSessions: number;
  periodLabel: string;
}

const SIZE_LABEL: Record<BucketSize, string> = {
  day: 'per day',
  week: 'per week',
  month: 'per month',
};

/**
 * Focus time over the selected period, aggregated to whatever granularity fits
 * it: days for a week or a month, weeks for a quarter, months for a year.
 * The series is real Focus Room time only — planned blocks never appear here.
 */
export function FocusTimeChart({
  buckets,
  size,
  averageMinutes,
  totalMinutes,
  totalSessions,
  periodLabel,
}: FocusTimeChartProps) {
  const isMobile = useIsMobile();
  const [hover, setHover] = useState<{
    bucket: FocusBucket;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  if (totalMinutes === 0) {
    return (
      <Section title="Focus time" delay={160} layout="card" wide>
        <EmptyState
          text="No focus time recorded in this period"
          hint={`${periodLabel} holds no finished Focus Room sessions.`}
        />
      </Section>
    );
  }

  const max = Math.max(...buckets.map((b) => b.minutes), 1);
  const peak = buckets.find((b) => b.minutes === max);
  const avgPercent = Math.min(100, (averageMinutes / max) * 100);
  const active = hover?.bucket || buckets.find((b) => b.key === picked) || null;
  // A 7-bar week should not stretch into seven slabs, but a 30-day
  // series should still use the full width — hence a cap, not a fix.
  const barWidthRem = buckets.length <= 14 ? 4 : 2.75;
  const chartWidth = `${buckets.length * barWidthRem}rem`;
  const chartHeight = buckets.length <= 14 ? 'h-32' : 'h-48';
  // Ticks thin out with the number of buckets, and much harder on a phone:
  // at 30 columns there is room for a handful of dates, not for thirty.
  const labelEvery = isMobile
    ? Math.max(1, Math.ceil(buckets.length / 5))
    : buckets.length > 20
      ? 2
      : 1;

  return (
    <Section
      title="Focus time"
      delay={160}
      layout="card"
      wide
      aside={
        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
          {formatDurationLong(totalMinutes)} · {totalSessions} session{totalSessions === 1 ? '' : 's'}
        </p>
      }
    >
      <div>
        {/* Readout: the hovered bucket on pointer devices, the tapped one on
            touch — the same three numbers either way. */}
        <div className="flex items-baseline justify-between gap-4 mb-4 min-h-[26px]">
          <p className="font-body-md text-body-md text-on-surface font-medium truncate">
            {active ? active.label : size === 'month' ? 'Monthly' : size === 'week' ? 'Weekly' : 'Daily'}
          </p>
          {active ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant tabular-nums flex-shrink-0">
              {formatDurationLong(active.minutes)} · {active.sessions} session
              {active.sessions === 1 ? '' : 's'}
            </p>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant tabular-nums flex-shrink-0">
              avg {formatDuration(Math.round(averageMinutes))} {SIZE_LABEL[size]}
            </p>
          )}
        </div>

        {/* A 7-bar week should not stretch into seven slabs, but a 30-day
            series should still use the full width — hence a cap, not a fix. */}
        <div className="relative w-full" style={{ maxWidth: chartWidth }}>
          <div className={`flex items-end gap-[2px] ${chartHeight}`}>
            {buckets.map((b, i) => {
              const percent = (b.minutes / max) * 100;
              const isPeak = peak?.key === b.key && b.minutes > 0;
              return (
                <button
                  key={b.key}
                  type="button"
                  aria-label={`${b.label}: ${formatDuration(b.minutes)}, ${b.sessions} sessions`}
                  className="group relative flex-1 h-full flex items-end rounded-t-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onMouseEnter={(e) => setHover({ bucket: b, ...anchorOf(e.currentTarget) })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(e) => setHover({ bucket: b, ...anchorOf(e.currentTarget) })}
                  onBlur={() => setHover(null)}
                  onClick={() => setPicked((p) => (p === b.key ? null : b.key))}
                >
                  {/* Full-height track keeps a sparse period readable instead
                      of leaving a chart that is mostly empty space. */}
                  <span className="absolute inset-0 rounded-t-sm bg-on-surface/[0.05]" />
                  {/* The accent colour at partial opacity: a solid surface token
                      would be the same shade as the card it sits on. */}
                  <span
                    className={`relative w-full rounded-t-sm animate-bar-grow-y ${
                      isPeak ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/70'
                    }`}
                    style={{
                      height: `${Math.max(percent, b.minutes > 0 ? 2 : 0)}%`,
                      animationDelay: `${Math.min(i * 25, 360)}ms`,
                    }}
                  />
                </button>
              );
            })}
          </div>
          {avgPercent > 0 && avgPercent < 100 && (
            <div
              className="absolute left-0 right-0 border-t border-dashed border-outline pointer-events-none"
              style={{ bottom: `${avgPercent}%` }}
            />
          )}
        </div>

        <div className="flex gap-[2px] w-full mt-2" style={{ maxWidth: chartWidth }}>
          {buckets.map((b, i) => (
            <span
              key={b.key}
              className="flex-1 text-center font-label-sm text-[8px] leading-none text-on-surface-variant whitespace-nowrap overflow-hidden"
            >
              {i % labelEvery === 0 ? b.short : ''}
            </span>
          ))}
        </div>
      </div>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} below={hover.below}>
          <p className="font-label-sm text-label-sm font-semibold whitespace-nowrap">{hover.bucket.label}</p>
          <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
            {hover.bucket.minutes > 0 ? formatDurationLong(hover.bucket.minutes) : 'No study'} ·{' '}
            {hover.bucket.sessions} session{hover.bucket.sessions === 1 ? '' : 's'}
          </p>
        </Tooltip>
      )}
    </Section>
  );
}
