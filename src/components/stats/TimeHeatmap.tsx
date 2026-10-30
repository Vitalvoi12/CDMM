import { Fragment, useState } from 'react';
import { formatDurationLong } from '../../utils/time';
import {
  HOUR_LABELS,
  WEEKDAY_LABELS,
  heatmapCellClass,
  hourRange,
  rhythmLevel,
  type Rhythm,
  type RhythmCell,
} from '../../utils/analytics';
import { EmptyState, Section, anchorOf, Tooltip, type StatLayout } from './StatParts';
import { boxClass } from './statLayout';

interface TimeHeatmapProps {
  rhythm: Rhythm;
  periodLabel: string;
  layout?: StatLayout;
}

/**
 * When study time lands: one row per hour of the day against the seven weekdays,
 * counted purely in studied time. Same intensity scale as the activity
 * calendar, so a cell here and a day there are read the same way. Hour labels
 * appear every third row — enough to orient, not enough to turn the grid into a
 * wall of digits.
 *
 * Deliberately motionless: a 24×7 field that reflows on hover reads as flicker,
 * so the cells neither animate nor scale, and the section skips the page's
 * entrance animation.
 */
export function TimeHeatmap({ rhythm, periodLabel, layout = 'section' }: TimeHeatmapProps) {
  const [hover, setHover] = useState<{
    cell: RhythmCell;
    label: string;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<{ cell: RhythmCell; label: string } | null>(null);

  if (rhythm.totalMinutes === 0) {
    return (
      <Section title="Time heatmap" delay={240} still layout={layout}>
        <EmptyState
          text="No study hours in this period"
          hint={`${periodLabel} holds no focus sessions, so there is no rhythm to show yet.`}
        />
      </Section>
    );
  }

  const peak = rhythm.peak;
  const active = hover || picked;

  return (
    <Section
      title="Time heatmap"
      delay={240}
      still
      layout={layout}
      aside={
        peak ? (
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            most often {WEEKDAY_LABELS[peak.weekday]} {HOUR_LABELS[peak.hour]}
          </p>
        ) : undefined
      }
    >
      <div className={boxClass(layout, '')}>
        {/* Two columns in one grid keeps every row label glued to its own row
            of cells at any width — a parallel flex column drifts otherwise. */}
        <div className="grid gap-x-3" style={{ gridTemplateColumns: '2.25rem minmax(0, 1fr)' }}>
          <span />
          <div className="grid grid-cols-7 gap-[3px] mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <span
                key={w}
                className="text-center font-label-sm text-[8px] leading-none text-on-surface-variant"
              >
                {w.slice(0, 1)}
              </span>
            ))}
          </div>

          {HOUR_LABELS.map((label, hour) => (
            <Fragment key={label}>
              <span className="font-label-sm text-[8px] leading-none text-on-surface-variant whitespace-nowrap self-center">
                {hour % 3 === 0 ? label : ''}
              </span>
              <div className="grid grid-cols-7 gap-[3px] mb-[3px]">
                {rhythm.cells.map((hours, weekday) => {
                  const cell = hours[hour];
                  const range = `${WEEKDAY_LABELS[weekday]} ${hourRange(hour)}`;
                  return (
                    <button
                      key={weekday}
                      type="button"
                      aria-label={`${range}: ${cell.minutes} minutes`}
                      className={`no-press transition-none active:transform-none h-[13px] rounded-[3px] border border-outline/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        heatmapCellClass(rhythmLevel(cell.minutes, rhythm.maxMinutes))
                      } ${picked?.label === range ? 'ring-2 ring-primary' : ''}`}
                      onMouseEnter={(e) => setHover({ cell, label: range, ...anchorOf(e.currentTarget) })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => setHover({ cell, label: range, ...anchorOf(e.currentTarget) })}
                      onBlur={() => setHover(null)}
                      onClick={() => setPicked((p) => (p?.label === range ? null : { cell, label: range }))}
                    />
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-3 min-h-[16px]">
          {active
            ? `${active.label} — ${
                active.cell.minutes > 0 ? formatDurationLong(active.cell.minutes) : 'nothing'
              }`
            : 'Hover or tap a cell for the exact time.'}
        </p>
      </div>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} below={hover.below}>
          <p className="font-label-sm text-label-sm font-semibold whitespace-nowrap">{hover.label}</p>
          <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
            {hover.cell.minutes > 0 ? formatDurationLong(hover.cell.minutes) : 'No study'}
          </p>
        </Tooltip>
      )}
    </Section>
  );
}