import { useMemo, useState } from 'react';
import { formatDurationLong, formatDuration } from '../../utils/time';
import { heatmapCellClass, heatmapLevel, parseISODate, type StudyDay } from '../../utils/analytics';
import { anchorOf, Tooltip } from './StatParts';


interface ActivityCalendarProps {
  days: StudyDay[];
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Day number text colour for a heat level (see `.heat-num-hi` in index.css). */
function numClass(level: number): string {
  return level >= 3 ? 'heat-num-hi' : 'text-on-surface-variant';
}

type Cell = { date: string; day: number; data: StudyDay | null };

/**
 * The period as a calendar: a single row of big day tiles for a week, calendar
 * months for anything longer. A day with no session is a faint tile; the rest
 * fill up with the same five-step scale the rhythm heatmap uses. Days outside
 * the selected period are faded, today is ringed, and a dot marks days that
 * belong to a run of consecutive study days.
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

  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  // Days that sit in a streak of 2+ consecutive study days.
  const streakDates = useMemo(() => {
    const out = new Set<string>();
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 2) run.forEach((d) => out.add(d));
      run = [];
    };
    for (const d of days) {
      if (d.minutes > 0) run.push(d.date);
      else flush();
    }
    flush();
    return out;
  }, [days]);

  const months = useMemo(() => {
    if (days.length === 0) return [];
    const first = parseISODate(days[0].date);
    const last = parseISODate(days[days.length - 1].date);
    if (!first || !last) return [];
    const out: { key: string; title: string; minutes: number; cells: (Cell | null)[] }[] = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cursor.getTime() <= last.getTime()) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const lead = (new Date(year, month, 1).getDay() + 6) % 7;
      const length = new Date(year, month + 1, 0).getDate();
      const cells: (Cell | null)[] = Array.from({ length: lead }, () => null);
      let minutes = 0;
      for (let d = 1; d <= length; d++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const data = byDate.get(key) || null;
        if (data) minutes += data.minutes;
        cells.push({ date: key, day: d, data });
      }
      out.push({
        key: `${year}-${month}`,
        title: `${MONTH_NAMES[month]}${year === new Date().getFullYear() ? '' : ` ${year}`}`,
        minutes,
        cells,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [days, byDate]);

  const active = hover?.day || picked || null;
  const span = months.length;
  const weekMode = days.length <= 7;

  const tileProps = (cell: StudyDay) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => setHover({ day: cell, ...anchorOf(e.currentTarget) }),
    onMouseLeave: () => setHover(null),
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => setHover({ day: cell, ...anchorOf(e.currentTarget) }),
    onBlur: () => setHover(null),
    onClick: () => setPicked((p) => (p?.date === cell.date ? null : cell)),
  });

  const tile = (cell: StudyDay, dayNum: number, big: boolean) => {
    const level = heatmapLevel(cell.minutes);
    const isPicked = picked?.date === cell.date;
    const isToday = cell.date === todayKey;
    return (
      <button
        key={cell.date}
        type="button"
        aria-label={`${cell.date}: ${cell.minutes} minutes`}
        className={`relative aspect-square w-full ${big ? 'rounded-[7px]' : 'rounded-[4px]'} flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${heatmapCellClass(level)} ${
          level === 0 ? 'border border-outline-variant/60' : ''
        } ${isToday ? 'ring-2 ring-on-surface' : isPicked ? 'ring-2 ring-primary' : ''}`}
        {...tileProps(cell)}
      >
        <span className={`tabular-nums leading-none ${big ? 'text-[15px] font-semibold' : 'text-[10px] opacity-80'} ${numClass(level)}`}>
          {dayNum}
        </span>
        {streakDates.has(cell.date) && (
          <span
            aria-hidden="true"
            className={`absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${level >= 3 ? 'bg-current heat-num-hi' : 'bg-primary'}`}
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {weekMode ? (
        <div className="grid grid-cols-7 gap-2 max-w-md">
          {days.map((d) => {
            const dt = parseISODate(d.date);
            const weekday = dt ? WEEKDAY_SHORT[(dt.getDay() + 6) % 7] : '';
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5 min-w-0">
                <span className={`font-label-sm text-[10px] leading-none uppercase tracking-wider ${d.date === todayKey ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                  {weekday}
                </span>
                {tile(d, dt ? dt.getDate() : 0, true)}
                <span className="font-label-sm text-[9px] leading-none text-on-surface-variant tabular-nums whitespace-nowrap tracking-normal">
                  {d.minutes > 0 ? formatDuration(d.minutes) : '–'}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        // Months side by side, as many per row as fit; a single month keeps
        // a readable width instead of stretching across the panel.
        <div
          className={`grid gap-x-4 gap-y-4 ${span > 1 ? 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]' : 'grid-cols-1 max-w-[20rem]'}`}
        >
          {months.map((month) => (
            <div key={month.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="font-label-md text-label-md text-on-surface truncate">{month.title}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant tabular-nums flex-shrink-0">
                  {month.minutes > 0 ? formatDurationLong(month.minutes) : ''}
                </p>
              </div>
              <div className="grid grid-cols-7 gap-[3px] mb-1">
                {WEEKDAY_INITIALS.map((w, i) => (
                  <span key={i} className="text-center font-label-sm text-[10px] leading-none text-on-surface-variant">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-[3px]">
                {month.cells.map((cell, i) => {
                  if (!cell) return <span key={`e-${i}`} className="aspect-square" />;
                  // Outside the selected period: faded and not interactive.
                  if (!cell.data) {
                    return (
                      <span
                        key={cell.date}
                        className="aspect-square rounded-[4px] flex items-center justify-center bg-heatmap-0 opacity-30"
                      >
                        <span className="text-[10px] leading-none tabular-nums text-on-surface-variant">{cell.day}</span>
                      </span>
                    );
                  }
                  return tile(cell.data, cell.day, false);
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="font-body-sm text-body-sm text-on-surface-variant min-h-[16px]">
          {active
            ? `${active.date} — ${
                active.minutes > 0
                  ? `${formatDurationLong(active.minutes)} · ${active.sessions} session${active.sessions === 1 ? '' : 's'}`
                  : 'no study'
              }`
            : 'Tap a day for details.'}
        </p>
        {/* Same five steps as the rhythm heatmap, so both read alike. */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            Less
          </span>
          <div className="flex gap-1">
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                className={`w-3.5 h-3.5 rounded-[4px] ${heatmapCellClass(level)} ${level === 0 ? 'border border-outline-variant/60' : ''}`}
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
