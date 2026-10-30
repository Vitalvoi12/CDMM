import { Fragment, useState } from 'react';
import { formatDurationLong } from '../../utils/time';
import {
  WEEKDAY_LABELS,
  heatmapCellClass,
  hourRange,
  rhythmLevel,
  type Rhythm,
  type RhythmCell,
} from '../../utils/analytics';
import { EmptyState, HeatLegend, Section, anchorOf, Tooltip } from './StatParts';

interface WhenYouStudyProps {
  rhythm: Rhythm;
  periodLabel: string;
}

/** Hours shown when nothing falls outside them. */
const FIRST_HOUR = 6;
const LAST_HOUR = 23;

const hh = (h: number) => String(h).padStart(2, '0');

/**
 * Desktop rhythm card: weekdays as rows, hours as columns. Only 06–23 by
 * default — the night is empty for most people and would halve the cells —
 * starting earlier when the period does have study time before 06:00. Same relative
 * levels as the phone's heatmap (rhythmLevel against the busiest cell).
 */
export function WhenYouStudy({ rhythm, periodLabel }: WhenYouStudyProps) {
  const [hover, setHover] = useState<{ cell: RhythmCell; label: string; x: number; y: number; below: boolean } | null>(
    null
  );
  const [picked, setPicked] = useState<string | null>(null);

  if (rhythm.totalMinutes === 0) {
    return (
      <Section title="When you study" delay={240} still layout="card">
        <EmptyState
          text="No study hours in this period"
          hint={`${periodLabel} holds no focus sessions, so there is no rhythm to show yet.`}
        />
      </Section>
    );
  }

  const used = (h: number) => rhythm.cells.some((row) => row[h].minutes > 0);
  let first = FIRST_HOUR;
  while (first > 0 && Array.from({ length: first }, (_, h) => h).some(used)) first--;
  const last = LAST_HOUR;
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const cols = `repeat(${hours.length}, minmax(0, 1fr))`;
  const rowCols = '2rem minmax(0, 1fr) 3.6rem';
  const peak = rhythm.peak;

  return (
    <Section
      title="When you study"
      delay={240}
      still
      layout="card"
      aside={
        peak ? (
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            most often {WEEKDAY_LABELS[peak.weekday]} {hh(peak.hour)}:00
          </span>
        ) : undefined
      }
    >
      <div className="grid gap-x-2.5 gap-y-[3px] items-center" style={{ gridTemplateColumns: rowCols }}>
        <span />
        <div className="grid gap-[3px] mb-0.5" style={{ gridTemplateColumns: cols }}>
          {hours.map((h) => (
            <span key={h} className="font-label-sm text-label-sm text-on-surface-variant tabular-nums whitespace-nowrap">
              {h % 3 === 0 ? hh(h) : ''}
            </span>
          ))}
        </div>
        <span className="text-right font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.06em]">
          Total
        </span>

        {rhythm.cells.map((row, weekday) => {
          const total = row.reduce((sum, c) => sum + c.minutes, 0);
          return (
            <Fragment key={weekday}>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{WEEKDAY_LABELS[weekday]}</span>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: cols }}>
                {hours.map((h) => {
                  const cell = row[h];
                  const label = `${WEEKDAY_LABELS[weekday]} ${hourRange(h)}`;
                  const level = rhythmLevel(cell.minutes, rhythm.maxMinutes);
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-label={`${label}: ${cell.minutes} minutes`}
                      className={`no-press transition-none active:transform-none aspect-square rounded-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${heatmapCellClass(
                        level
                      )} ${level === 0 ? 'border border-outline/60' : ''} ${picked === label ? 'ring-2 ring-primary' : ''}`}
                      onMouseEnter={(e) => setHover({ cell, label, ...anchorOf(e.currentTarget) })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => setHover({ cell, label, ...anchorOf(e.currentTarget) })}
                      onBlur={() => setHover(null)}
                      onClick={() => setPicked((p) => (p === label ? null : label))}
                    />
                  );
                })}
              </div>
              <span className="text-right font-body-sm text-body-sm text-on-surface-variant tabular-nums whitespace-nowrap">
                {total > 0 ? formatDurationLong(total) : '—'}
              </span>
            </Fragment>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {hh(first)}:00–{hh(last + 1)}:00
          {first > 0 ? ' · quiet hours at either end are hidden' : ''}
        </p>
        <HeatLegend />
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
