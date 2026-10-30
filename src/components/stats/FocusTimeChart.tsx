import { useState } from 'react';
import { dateKey, formatDuration, formatDurationLong } from '../../utils/time';
import type { BucketSize, FocusBucket } from '../../utils/analytics';
import { EmptyState, Section, anchorOf, Tooltip } from './StatParts';

interface FocusTimeChartProps {
  buckets: FocusBucket[];
  size: BucketSize;
  /** Average minutes per bucket, drawn as the reference line. */
  averageMinutes: number;
  totalMinutes: number;
  periodLabel: string;
  /** The period reaches today: its bucket is drawn solid. */
  includesToday: boolean;
}

const SIZE_LABEL: Record<BucketSize, string> = {
  day: 'per day',
  week: 'per week',
  month: 'per month',
};

/** Axis steps in minutes, smallest first: the first that fits in 4 ticks wins. */
const STEPS = [15, 30, 60, 120, 180, 240, 360, 600, 720, 1200, 1800, 2400, 3600, 6000, 12000];

function axisFor(max: number): { top: number; step: number } {
  const step = STEPS.find((s) => Math.ceil(max / s) <= 4) ?? Math.ceil(max / 4 / 600) * 600;
  return { top: Math.max(step, Math.ceil(max / step) * step), step };
}

/**
 * Desktop: focus time over the selected period, aggregated to whatever
 * granularity fits it — days for a week or a month, weeks for a quarter,
 * months for a year. Real Focus Room time only; planned blocks never appear.
 * Values sit on the bars while there are few of them; past 14 they would
 * crowd into a smear, so the tooltip carries them instead.
 */
export function FocusTimeChart({
  buckets,
  size,
  averageMinutes,
  totalMinutes,
  periodLabel,
  includesToday,
}: FocusTimeChartProps) {
  const [hover, setHover] = useState<{
    bucket: FocusBucket;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);

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

  const { top, step } = axisFor(Math.max(...buckets.map((b) => b.minutes), 1));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const avgPos = (averageMinutes / top) * 100;
  // The bucket holding today: the last one that starts on or before it.
  const todayKey = dateKey(new Date());
  const currentKey = includesToday ? [...buckets].reverse().find((b) => b.key <= todayKey)?.key : undefined;
  const showValues = buckets.length <= 14;
  const gap = buckets.length <= 7 ? '1.2rem' : buckets.length <= 14 ? '0.6rem' : '3px';
  const labelEvery = buckets.length > 20 ? Math.ceil(buckets.length / 10) : 1;

  return (
    <Section
      title="Focus time"
      delay={160}
      layout="card"
      wide
      aside={
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {SIZE_LABEL[size]} · dashed line is the average
        </span>
      }
    >
      <div className="grid gap-x-2" style={{ gridTemplateColumns: '2.4rem minmax(0, 1fr)' }}>
        <div className="relative h-[11rem]">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 font-label-sm text-label-sm text-on-surface-variant tabular-nums"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {t === 0 ? '0' : formatDuration(t)}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={`Focus time ${SIZE_LABEL[size]}: ${buckets.map((b) => `${b.label} ${formatDuration(b.minutes)}`).join(', ')}`}
          className="relative h-[11rem]"
        >
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-outline-variant"
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end px-3" style={{ gap }}>
            {buckets.map((b, i) => {
              const current = b.key === currentKey;
              return (
                <div
                  key={b.key}
                  className="flex-1 min-w-0 h-full flex flex-col justify-end items-stretch gap-1.5"
                  onMouseEnter={(e) => setHover({ bucket: b, ...anchorOf(e.currentTarget) })}
                  onMouseLeave={() => setHover(null)}
                >
                  {showValues && b.minutes > 0 && (
                    <span
                      className={`text-center font-label-sm text-label-sm tabular-nums whitespace-nowrap ${
                        current ? 'text-on-surface' : 'text-on-surface-variant'
                      }`}
                    >
                      {formatDuration(b.minutes)}
                    </span>
                  )}
                  <div
                    className={`rounded-t origin-bottom animate-bar-grow-y ${current ? 'bg-primary' : 'bg-primary/55'}`}
                    style={{
                      height: `${(b.minutes / top) * 100}%`,
                      minHeight: b.minutes > 0 ? 2 : 0,
                      animationDelay: `${Math.min(i * 25, 360)}ms`,
                    }}
                  />
                </div>
              );
            })}
          </div>
          {avgPos > 0 && (
            <>
              <div
                className="absolute inset-x-0 border-t border-dashed border-on-surface-variant/80 pointer-events-none"
                style={{ bottom: `${avgPos}%` }}
              />
              <span
                className="absolute right-0 -translate-y-[120%] px-1.5 rounded bg-surface-container-lowest font-label-sm text-label-sm text-on-surface-variant tabular-nums pointer-events-none"
                style={{ bottom: `${avgPos}%` }}
              >
                avg {formatDuration(Math.round(averageMinutes))}
              </span>
            </>
          )}
        </div>

        <span />
        <div className="flex px-3 pt-2" style={{ gap }}>
          {buckets.map((b, i) => (
            <span
              key={b.key}
              className={`flex-1 min-w-0 text-center font-label-sm text-label-sm tabular-nums whitespace-nowrap overflow-visible ${
                b.key === currentKey ? 'text-on-surface' : 'text-on-surface-variant'
              }`}
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
