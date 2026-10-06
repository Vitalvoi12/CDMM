import { useMemo, useRef } from 'react';
import type { CalendarEvent, EventFilter, Subject } from '../../types';
import { getMonthGrid, formatDayOfMonth, isSameDay, timeFromDate } from '../../utils/time';
import { getEventsForDate } from '../../utils/stats';
import { MONTH_BLOCK, monthSlots } from '../../utils/eventDensity';
import { useAvailableHeight } from '../../hooks/useAvailableHeight';
import { contrastOn, eventFillColor, isDarkTheme, pageBackground } from '../../utils/color';

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  subjects: Subject[];
  /** Real / Plan / All — the same switch the timelines obey. */
  mode?: EventFilter;
  onDateSelect: (date: Date) => void;
  /** Opens the editor; clicking anywhere else in the cell only selects the day. */
  onEventClick?: (event: CalendarEvent) => void;
  /** Running study session — shown as a LIVE badge on today's cell. */
  liveSession?: { subjectId: string; start: string } | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Day-number padding (8+8) + number row (13) + margin above the list (4). */
const CELL_HEAD_PX = 38;
/** The LIVE chip under today's number. */
const LIVE_PX = 18;
/** Row height assumed on the very first paint, before the measure lands. */
const FALLBACK_ROW_PX = 96;

/**
 * The month grid: one cell per day, its events listed underneath the day
 * number as mini blocks — the timeline block's dress at cell scale.
 *
 * The cell is a `<div role="button">` rather than a `<button>` so the event
 * blocks inside it can be real buttons: a button nested in a button is not
 * valid markup and browsers would flatten or drop the inner one.
 */
export function MonthView({
  date,
  events,
  subjects,
  mode = 'all',
  onDateSelect,
  onEventClick,
  liveSession = null,
}: MonthViewProps) {
  const grid = useMemo(() => getMonthGrid(date), [date]);
  const subjectMap = useMemo(() => {
    const m: Record<string, Subject> = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);
  const weeks = Math.max(1, Math.ceil(grid.length / 7));
  // Stretch the week rows to fill all free vertical space inside <main>.
  const gridAnchorRef = useRef<HTMLDivElement>(null);
  const availPx = useAvailableHeight(gridAnchorRef);

  // Rows are equal height (grid `1fr`), so a single measurement of the grid
  // tells how much of every cell is left for blocks — no per-cell measuring.
  const listPx = useMemo(() => {
    const rowPx = availPx > 0 ? (availPx - (weeks - 1)) / weeks : FALLBACK_ROW_PX;
    return Math.max(0, rowPx - CELL_HEAD_PX);
  }, [availPx, weeks]);

  const now = new Date();
  const showLive = mode !== 'plan';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto animate-view-enter">
      <div className="grid grid-cols-7 gap-px mb-4 flex-shrink-0 sticky top-0 z-10 bg-background">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>
      <div
        ref={gridAnchorRef}
        className="flex-1 grid grid-cols-7 gap-px min-h-0"
        style={{
          gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
          minHeight: availPx > 0 ? `${availPx}px` : undefined,
        }}
      >
        {grid.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} className="min-h-[58px] bg-surface-container-low/30" />;
          // The cells follow the Real/Plan switch exactly like the timelines:
          // 'all' lists both kinds in one column, ordered by start time.
          const dayEvents = getEventsForDate(events, d).filter(
            (e) => mode === 'all' || (e.kind ?? 'real') === mode
          );
          const today = isSameDay(d, now);
          const live = today && liveSession && showLive;
          const { shown, hidden } = monthSlots(listPx - (live ? LIVE_PX : 0), dayEvents.length);
          const dateLabel = d.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
          const ariaLabel = dayEvents.length
            ? `${dateLabel}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`
            : dateLabel;
          const liveSubject = liveSession ? subjectMap[liveSession.subjectId] : undefined;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={ariaLabel}
              onClick={() => onDateSelect(d)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDateSelect(d);
                }
              }}
              className={`@container min-h-[58px] p-2 text-left overflow-hidden cursor-pointer transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                today ? 'bg-surface-container' : 'bg-surface-container-low/30'
              }`}
            >
              <span className="flex items-center justify-between gap-1">
                <span className={`font-label-md text-label-md max-lg:!text-[9px] ${today ? 'text-primary font-bold' : 'text-on-surface'}`}>
                  {formatDayOfMonth(d)}
                </span>
                {live && (
                  <span className="flex items-center gap-1 font-label-sm text-[8px] text-error uppercase tracking-widest flex-shrink-0">
                    <span className="relative flex w-1.5 h-1.5">
                      <span className="absolute w-full h-full bg-now rounded-full opacity-40 animate-ping" />
                      <span className="w-1.5 h-1.5 bg-now rounded-full" />
                    </span>
                    Live
                  </span>
                )}
              </span>
              {live && (
                <div className="mt-1 flex items-center gap-1 px-1 py-0.5 rounded bg-error/10 text-[8px] text-on-surface truncate">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: liveSubject?.color || 'var(--color-error)' }} />
                  <span className="truncate">{liveSubject?.name || 'Studying'} · live</span>
                </div>
              )}
              {dayEvents.length > 0 && (
                <div className="mt-1 flex flex-col min-h-0" style={{ gap: `${MONTH_BLOCK.gap}px` }}>
                  {dayEvents.slice(0, shown).map((ev) => (
                    <MonthEventBlock
                      key={ev.id}
                      event={ev}
                      subject={subjectMap[ev.subjectId]}
                      onClick={onEventClick}
                    />
                  ))}
                  {hidden > 0 && (
                    <span className="font-label-sm text-label-sm leading-none text-on-surface-variant truncate">
                      +{hidden} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One event inside a day cell: the timeline block's dress at cell scale —
 * subject fill with the brighter spine on the left, plans solid and real
 * sessions muted, name plus start time on a single line.
 *
 * Wide cells (≥7rem — the point where a time stamp still leaves room for the
 * name) show the start time; narrower ones drop it and keep it in the tooltip,
 * so nothing turns into an ellipsis soup on a tablet.
 */
function MonthEventBlock({
  event,
  subject,
  onClick,
}: {
  event: CalendarEvent;
  subject?: Subject;
  onClick?: (event: CalendarEvent) => void;
}) {
  const plan = event.kind === 'plan';
  const color = subject?.color || 'var(--color-on-surface-variant)';
  const fill = eventFillColor(event, subject);
  const name = subject?.name || event.title || 'Untitled';
  const bg = plan ? fill : `color-mix(in srgb, ${color} 42%, var(--color-surface-dim))`;
  const spine = plan ? 'rgb(255 255 255 / 0.28)' : color;
  const fgStyle = plan ? { color: isDarkTheme() ? pageBackground() : contrastOn(fill) } : undefined;
  const timeRange = `${timeFromDate(event.start)} - ${timeFromDate(event.end)}`;
  const title =
    event.countInStats === false
      ? `${name} · ${timeRange} · Excluded from statistics`
      : `${name} · ${timeRange}`;

  return (
    <button
      type="button"
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(event); } : undefined}
      title={title}
      className="relative flex items-center gap-1.5 w-full rounded-[4px] pl-2 pr-1 overflow-hidden text-left cursor-pointer transition-[filter] hover:brightness-110 ring-1 ring-inset ring-black/30 outline outline-1 outline-white/20 focus-visible:ring-2 focus-visible:ring-primary"
      style={{ height: `${MONTH_BLOCK.height}px`, backgroundColor: bg }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[4px]" style={{ backgroundColor: spine }} />
      <span
        className="hidden @min-[7rem]:inline font-body-sm text-body-sm leading-none tabular-nums shrink-0 text-on-surface-variant opacity-80"
        style={fgStyle}
      >
        {timeFromDate(event.start)}
      </span>
      <span
        className="font-body-sm text-body-sm leading-none font-medium truncate min-w-0 text-on-surface"
        style={fgStyle}
      >
        {name}
      </span>
    </button>
  );
}
