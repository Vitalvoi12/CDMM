import type { ConsistencyStats, StudyDay } from '../../utils/analytics';
import { formatDurationLong } from '../../utils/time';
import { ActivityCalendar } from './ActivityCalendar';
import { Section, StatTile } from './StatParts';

interface ConsistencyPanelProps {
  stats: ConsistencyStats;
  days: StudyDay[];
  periodLabel: string;
}

/**
 * How regular the period was. The numbers come first, the calendar underneath
 * shows the same data day by day — the streak is one figure among several, not
 * the headline the section is built around.
 */
export function ConsistencyPanel({ stats, days, periodLabel }: ConsistencyPanelProps) {
  const tiles = [
    { value: `${stats.activeDays}`, label: 'Active days', hint: `${days.length} in period` },
    { value: `${stats.currentStreak}`, label: 'Current streak', hint: 'days' },
    { value: `${stats.longestStreak}`, label: 'Longest streak', hint: 'days' },
  ];

  return (
    <Section title="Consistency" delay={320}>
      <div className="grid grid-cols-3 gap-6 mb-8">
        {tiles.map((t, i) => (
          <StatTile
            key={t.label}
            value={t.value}
            label={t.label}
            hint={t.hint}
            delay={360 + i * 60}
          />
        ))}
      </div>
      <div className="rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5">
        <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
          <h3 className="font-label-sm text-label-sm text-on-surface uppercase tracking-widest">
            Activity calendar
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant tabular-nums">
            {formatDurationLong(
              days.reduce((sum, d) => sum + d.minutes, 0)
            )}{' '}
            · {Math.round(stats.activeShare * 100)}% of {periodLabel}
          </p>
        </div>
        <ActivityCalendar days={days} />
      </div>
    </Section>
  );
}
