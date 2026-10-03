import { useMemo, useState } from 'react';
import { formatDurationLong } from '../../utils/time';
import { heatmapCellClass, heatmapLevel, parseISODate, type StudyDay } from '../../utils/analytics';
import { anchorOf, Tooltip } from './StatParts';


interface ActivityCalendarProps {
  days: StudyDay[];
}

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * The period as calendar months, one cell per day. A day with no session is an
 * outline; the rest fill up with the same five-step scale the rhythm heatmap
 * uses, so "how hard was that day" reads at a glance.
 */
export function ActivityCalendar({ days }: ActivityCalendarProps) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const [hover, setHover] = useState<{
    day: StudyDay;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<StudyDay | null>(null);

  const months = useMemo(() => {
    if (days.length === 0) return [];
    const first = parseISODate(days[0].date);
    const last = parseISODate(days[days.length - 1].date);
    if (!first || !last) return [];
    const out: { key: string; title: string; cells: (StudyDay | null)[] }[] = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cursor.getTime() <= last.getTime()) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const lead = (new Date(year, month, 1).getDay() + 6) % 7;
      const length = new Date(year, month + 1, 0).getDate();
      const cells: (StudyDay | null)[] = Array.from({ length: lead }, () => null);
      for (let d = 1; d <= length; d++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const day = byDate.get(key);
        cells.push(day || null);
      }
      out.push({
        key: `${year}-${month}`,
        title: `${MONTH_NAMES[month]}${year === new Date().getFullYear() ? '' : ` ${year}`}`,
        cells,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [days, byDate]);

  const active = hover?.day || picked || null;
  const span = months.length;

  return (
    <div className="flex flex-col gap-5">
      <div
        className={`grid gap-x-6 gap-y-5 ${span > 6 ? 'grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4' : span > 3 ? 'grid-cols-2 lg:grid-cols-3' : span > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {months.map((month) => (
          <div key={month.key} className="min-w-0 max-w-[13rem]">
            <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 truncate">
              {month.title}
            </p>
            <div className="grid grid-cols-7 gap-[3px] mb-1">
              {WEEKDAY_INITIALS.map((w, i) => (
                <span
                  key={i}
                  className="text-center font-label-sm text-[7px] leading-none text-on-surface-variant"
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[3px]">
              {month.cells.map((cell, i) => {
                if (!cell) return <span key={`e-${i}`} className="aspect-square" />;
                const isPicked = picked?.date === cell.date;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    aria-label={`${cell.date}: ${cell.minutes} minutes`}
                    className={`aspect-square rounded-[4px] border border-outline/80 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      heatmapCellClass(heatmapLevel(cell.minutes))
                    } ${isPicked ? 'ring-2 ring-primary' : ''}`}
                    onMouseEnter={(e) => setHover({ day: cell, ...anchorOf(e.currentTarget) })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => setHover({ day: cell, ...anchorOf(e.currentTarget) })}
                    onBlur={() => setHover(null)}
                    onClick={() => setPicked((p) => (p?.date === cell.date ? null : cell))}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="font-body-sm text-body-sm text-on-surface-variant min-h-[16px]">
          {active
            ? `${active.date} — ${
                active.minutes > 0
                  ? `${formatDurationLong(active.minutes)} · ${active.sessions} session${active.sessions === 1 ? '' : 's'}`
                  : 'no study'
              }`
            : `${days.length} day${days.length === 1 ? '' : 's'} in this period.`}
        </p>
        {/* Same five steps as the rhythm heatmap, so both read alike. */}
        <div className="flex items-center gap-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            Less
          </span>
          <div className="flex gap-[3px]">
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                className={`w-3 h-3 rounded-[3px] border border-outline/80 ${heatmapCellClass(level)}`}
              />
            ))}
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            More
          </span>
        </div>
      </div>
      {hover && (
        <Tooltip x={hover.x} y={hover.y} below={hover.below}>
          <p className="font-label-sm text-label-sm font-semibold whitespace-nowrap">{hover.day.date}</p>
          <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
            {hover.day.minutes > 0
              ? `${formatDurationLong(hover.day.minutes)} · ${hover.day.sessions} session${hover.day.sessions === 1 ? '' : 's'}`
              : 'No study'}
          </p>
        </Tooltip>
      )}
    </div>
  );
}
