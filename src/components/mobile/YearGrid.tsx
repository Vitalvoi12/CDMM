import { useMemo } from 'react';
import type { CalendarEvent } from '../../types';
import { splitStudySlices } from '../../utils/analytics';
import { dateKey, formatDurationLong, getMonthGrid } from '../../utils/time';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Heat level of a day from its focus minutes: none, <1h, <2h, <3h, 3h+. */
function level(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  if (minutes < 120) return 2;
  if (minutes < 180) return 3;
  return 4;
}

interface YearGridProps {
  date: Date;
  events: CalendarEvent[];
  onDateSelect: (date: Date) => void;
}

/**
 * The phone's year: twelve month cards, two to a row, every day tinted by
 * the focus it saw (the Statistics heatmap scale), with the year's focus and
 * active days on top. Minutes come from splitStudySlices, so they match
 * Statistics: real sessions that count toward stats.
 */
export function YearGrid({ date, events, onDateSelect }: YearGridProps) {
  const year = date.getFullYear();
  const now = new Date();
  const todayKey = dateKey(now);
  const thisMonth = now.getFullYear() === year ? now.getMonth() : -1;

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    const prefix = `${year}-`;
    for (const s of splitStudySlices(events)) {
      if (s.date.startsWith(prefix)) m.set(s.date, (m.get(s.date) ?? 0) + s.minutes);
    }
    return m;
  }, [events, year]);

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(year, i, 1);
        const cells = getMonthGrid(monthDate);
        let minutes = 0;
        for (const d of cells) if (d) minutes += byDay.get(dateKey(d)) ?? 0;
        return { monthDate, name: monthDate.toLocaleDateString('en-US', { month: 'long' }), cells, minutes };
      }),
    [year, byDay]
  );

  let total = 0;
  for (const v of byDay.values()) total += v;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto m-pill-clear">
      <div className="m-yr">
        <div className="m-yr-sum">
          <div className="flex" style={{ gap: 20 }}>
            <div className="m-tile" style={{ gap: 0 }}>
              <span className="m-lbl m-mut">Focus</span>
              <b className="m-num">{formatDurationLong(total)}</b>
            </div>
            <div className="m-tile" style={{ gap: 0 }}>
              <span className="m-lbl m-mut">Active days</span>
              <b className="m-num">{[...byDay.values()].filter((v) => v > 0).length}</b>
            </div>
          </div>
          <div className="m-yr-leg" aria-hidden="true">
            <span className="m-sm m-mut">Less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} style={{ background: `var(--color-heatmap-${l})` }} />
            ))}
            <span className="m-sm m-mut">More</span>
          </div>
        </div>

        <div className="m-yr-grid">
          {months.map(({ monthDate, name, cells, minutes }) => (
            <section key={name} aria-label={name} className={`m-ym ${monthDate.getMonth() === thisMonth ? 'cur' : ''}`}>
              <div className="m-ym-h">
                <span className="m-lbl">{name}</span>
                <span className="m-sm m-mut m-num">{minutes > 0 ? formatDurationLong(minutes) : ''}</span>
              </div>
              <div className="m-ym-d">
                {DOW.map((d, i) => (
                  <span key={i} aria-hidden="true" className="wd">
                    {d}
                  </span>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <span key={i} aria-hidden="true" />;
                  const key = dateKey(d);
                  const min = byDay.get(key) ?? 0;
                  const cls = [`m-yd l${level(min)}`, key === todayKey && 'today', key > todayKey && 'fut'].filter(Boolean).join(' ');
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      onClick={() => onDateSelect(d)}
                      aria-label={`${name} ${d.getDate()}, ${year}${min > 0 ? `, ${formatDurationLong(min)} focus` : ''}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
