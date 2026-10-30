import { useState } from 'react';
import { dateKey, formatDurationLong } from '../../utils/time';
import {
  heatmapCellClass,
  historyLevel,
  parseISODate,
  toISODate,
  type ActivityHistory,
  type ConsistencyStats,
  type Period,
  type StudyDay,
} from '../../utils/analytics';
import { EmptyState, HeatLegend, Section, StatTile, anchorOf, Tooltip } from './StatParts';

interface ConsistencyCardProps {
  history: ActivityHistory;
  /** Period figures (active days); the streaks come from `history`. */
  stats: ConsistencyStats;
  period: Period;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EMPTY_EDGE = 'inset 0 0 0 1px color-mix(in srgb, var(--color-outline) 60%, transparent)';

function shortDate(key: string): string {
  const d = parseISODate(key);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : key;
}

/**
 * Desktop Consistency: one continuous grid of weeks (Monday on top), the
 * selected period outlined inside its history. Shades are relative to the
 * visible days (historyLevel), not the phone calendar's fixed thresholds.
 */
export function ConsistencyCard({ history, stats, period }: ConsistencyCardProps) {
  const [hover, setHover] = useState<{ day: StudyDay; future: boolean; x: number; y: number; below: boolean } | null>(
    null
  );

  if (history.activeMinutes.length === 0) {
    return (
      <Section title="Consistency" delay={320} layout="card">
        <EmptyState
          text="No study days in these weeks"
          hint={`Nothing was studied in these ${history.weeks} weeks. Finished Focus Room sessions fill this calendar.`}
        />
      </Section>
    );
  }

  const todayKey = dateKey(new Date());
  const fromKey = toISODate(period.from);
  const toKey = toISODate(period.to);
  const { weeks, longest } = history;
  const gap = weeks > 30 ? 2 : 3;
  // A period that fills the whole grid (Year) would outline every cell and
  // mark nothing, so the outline only appears when it picks out a part.
  const outline = fromKey > history.days[7].date;

  // A month's name sits over the week holding its 1st.
  const months: { label: string; week: number }[] = [];
  history.days.forEach((d, i) => {
    if (d.date.endsWith('-01')) months.push({ label: shortDate(d.date).slice(0, 3), week: Math.floor(i / 7) });
  });

  return (
    <Section
      title="Consistency"
      delay={320}
      layout="card"
      aside={
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {history.endsNow ? `last ${weeks} weeks` : `${weeks} weeks to ${shortDate(history.days[history.days.length - 1].date)}`}
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <StatTile value={`${stats.activeDays} / ${period.days}`} label="Active days" hint="in this period" />
        <StatTile value={history.currentStreak} label="Current streak" hint="days in a row" delay={60} />
        <StatTile
          value={longest?.length ?? 0}
          label="Longest"
          hint={longest ? `${shortDate(longest.from)} – ${shortDate(longest.to)}` : 'no streak yet'}
          delay={120}
        />
      </div>

      <div className="grid gap-x-2" style={{ gridTemplateColumns: '1.6rem minmax(0, 1fr)' }}>
        <span />
        <div className="relative h-4">
          {months.map((m) => (
            <span
              key={`${m.label}-${m.week}`}
              className="absolute top-0 font-label-sm text-label-sm text-on-surface-variant"
              style={{ left: `${(m.week / weeks) * 100}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div className="grid grid-rows-7" style={{ rowGap: gap }}>
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((w, i) => (
            <span key={i} className="self-center font-label-sm text-[10px] leading-none text-on-surface-variant">
              {w}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`Study days over the last ${weeks} weeks. Current streak ${history.currentStreak} days, longest ${longest?.length ?? 0}.`}
          className="grid grid-flow-col grid-rows-7"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, gap }}
        >
          {history.days.map((d) => {
            const future = d.date > todayKey;
            const level = future ? 0 : historyLevel(d.minutes, history.activeMinutes);
            const inPeriod = d.date >= fromKey && d.date <= toKey;
            const edge =
              d.date === todayKey
                ? '0 0 0 2px var(--color-on-surface)'
                : outline && inPeriod && !future
                  ? '0 0 0 1px var(--color-on-surface-variant)'
                  : level === 0
                    ? EMPTY_EDGE
                    : undefined;
            return (
              <span
                key={d.date}
                className={`aspect-square ${weeks > 30 ? 'rounded-[2px]' : 'rounded-[3px]'} ${future ? 'opacity-50' : heatmapCellClass(level)}`}
                style={{ boxShadow: edge }}
                onMouseEnter={(e) => setHover({ day: d, future, ...anchorOf(e.currentTarget) })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {outline ? 'Outlined: this period · ringed: today.' : 'Ringed: today.'} Shades follow your own busy and quiet
          days.
        </p>
        <HeatLegend />
      </div>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} below={hover.below}>
          <p className="font-label-sm text-label-sm font-semibold whitespace-nowrap">
            {parseISODate(hover.day.date)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
            {hover.future
              ? 'Ahead'
              : hover.day.minutes > 0
                ? `${formatDurationLong(hover.day.minutes)} · ${hover.day.sessions} session${hover.day.sessions === 1 ? '' : 's'}`
                : 'No study'}
          </p>
        </Tooltip>
      )}
    </Section>
  );
}
