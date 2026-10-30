import { FOCUS_LABELS, MIN_FOCUS_SAMPLE, type FocusGroup, type FocusQuality } from '../../utils/analytics';
import { EmptyState, Foot, Section, StatTile, type StatLayout } from './StatParts';
import { boxClass } from './statLayout';

interface FocusQualityPanelProps {
  stats: FocusQuality;
  periodLabel: string;
  layout?: StatLayout;
}

const DIMENSION_TEXT = {
  time: (label: string) => `in the ${label.toLowerCase()}`,
  weekday: (label: string) => `on ${label}`,
  length: (label: string) => `in ${label} sessions`,
} as const;

function fmtAvg(avg: number | null): string {
  return avg === null ? '—' : avg.toFixed(1);
}

/** One split (time of day / weekday / length): a bar per group, height = mean rating. */
function GroupBars({ title, groups, bestLabel, layout }: { title: string; groups: FocusGroup[]; bestLabel?: string; layout: StatLayout }) {
  return (
    <div className={boxClass(layout, 'min-w-0')}>
      <h3 className="font-label-sm text-label-sm text-on-surface uppercase tracking-widest mb-4">{title}</h3>
      <div className="flex items-end gap-2 h-28">
        {groups.map((g) => {
          // 1 → a third of the height, 3 → full: the floor of the scale is a
          // rated session, not zero, so an "okay" bar is not drawn as nothing.
          const h = g.average === null ? 0 : (g.average / 3) * 100;
          const isBest = g.label === bestLabel;
          return (
            <div
              key={g.label}
              className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1"
              title={g.count > 0 ? `${g.label}: ${fmtAvg(g.average)} avg over ${g.count} rated session${g.count === 1 ? '' : 's'}` : `${g.label}: no rated sessions`}
            >
              <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">{fmtAvg(g.average)}</span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-t-md origin-bottom animate-bar-grow-y ${isBest ? 'bg-primary' : g.count < MIN_FOCUS_SAMPLE ? 'bg-primary/30' : 'bg-primary/60'}`}
                  style={{ height: `${h}%` }}
                />
              </div>
              <span className="font-label-sm text-[10px] text-on-surface-variant truncate max-w-full">{g.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Focus quality: the 1–3 rating given after each session, split by when the
 * session started, its weekday and its length. It answers "when do I work
 * best", which hours at the desk alone cannot. Faint bars have fewer than
 * MIN_FOCUS_SAMPLE ratings and never count as the best group.
 */
export function FocusQualityPanel({ stats, periodLabel, layout = 'section' }: FocusQualityPanelProps) {
  if (stats.rated === 0) {
    return (
      <Section title="Focus quality" delay={280} layout={layout} wide>
        <EmptyState
          text="No rated sessions in this period"
          hint={`Nothing was rated between ${periodLabel}. Rate your focus (1–3) when you finish a session — after a few, this shows when you work best.`}
        />
      </Section>
    );
  }

  const best = stats.best;
  const tiles = [
    { value: fmtAvg(stats.average), label: 'Average focus', hint: 'out of 3' },
    { value: `${stats.rated}`, label: 'Rated', hint: `of ${stats.sessions} session${stats.sessions === 1 ? '' : 's'}` },
    {
      value: `${Math.round((stats.distribution[3] / stats.rated) * 100)}%`,
      label: FOCUS_LABELS[3],
      hint: `${stats.distribution[1]} scattered · ${stats.distribution[2]} okay`,
    },
  ];

  return (
    <Section title="Focus quality" delay={280} layout={layout} wide>
      <p className={`font-body-lg text-body-lg text-on-surface ${layout === 'card' ? '' : 'mb-6'}`}>
        {best
          ? `You focus best ${DIMENSION_TEXT[best.dimension](best.group.label)} — ${fmtAvg(best.group.average)} on average over ${best.group.count} sessions.`
          : `Rate at least ${MIN_FOCUS_SAMPLE} sessions in one time slot to see when you work best.`}
      </p>
      <div className={`grid grid-cols-3 gap-6 ${layout === 'card' ? '' : 'mb-8'}`}>
        {tiles.map((t, i) => (
          <StatTile key={t.label} value={t.value} label={t.label} hint={t.hint} delay={320 + i * 60} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GroupBars title="Time of day" groups={stats.byTimeOfDay} bestLabel={best?.dimension === 'time' ? best.group.label : undefined} layout={layout} />
        <GroupBars title="Weekday" groups={stats.byWeekday} bestLabel={best?.dimension === 'weekday' ? best.group.label : undefined} layout={layout} />
        <GroupBars title="Session length" groups={stats.byLength} bestLabel={best?.dimension === 'length' ? best.group.label : undefined} layout={layout} />
      </div>
      <Foot layout={layout}>
        Mean rating per group (1 scattered · 2 okay · 3 deep). Faint bars have fewer than {MIN_FOCUS_SAMPLE} ratings.
      </Foot>
    </Section>
  );
}
