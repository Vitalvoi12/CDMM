import { useMemo, useRef } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { getMonthGrid, formatDayOfMonth, isSameDay } from '../../utils/time';
import { getEventsForDate } from '../../utils/stats';
import { minutesBetween } from '../../utils/time';
import { useAvailableHeight } from '../../hooks/useAvailableHeight';

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  subjects: Subject[];
  onDateSelect: (date: Date) => void;
  /** Running study session — shown as a LIVE badge on today's cell. */
  liveSession?: { subjectId: string; start: string } | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView({ date, events, subjects, onDateSelect, liveSession = null }: MonthViewProps) {
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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
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
          const dayEvents = getEventsForDate(events, d);
          const totalMinutes = dayEvents.reduce((sum, e) => sum + minutesBetween(e.start, e.end), 0);
          const today = isSameDay(d, new Date());
          const liveSubject = liveSession ? subjectMap[liveSession.subjectId] : undefined;
          return (
            <button
              key={i}
              onClick={() => onDateSelect(d)}
              className={`min-h-[58px] p-2 text-left overflow-hidden transition-colors hover:bg-surface-container-low ${
                today ? 'bg-surface-container' : 'bg-surface-container-low/30'
              }`}
            >
              <span className="flex items-center justify-between gap-1">
                <span className={`font-label-sm text-label-sm ${today ? 'text-primary font-bold' : 'text-on-surface'}`}>
                  {formatDayOfMonth(d)}
                </span>
                {today && liveSession && (
                  <span className="flex items-center gap-1 font-label-sm text-[8px] text-error uppercase tracking-widest flex-shrink-0">
                    <span className="relative flex w-1.5 h-1.5">
                      <span className="absolute w-full h-full bg-now rounded-full opacity-40 animate-ping" />
                      <span className="w-1.5 h-1.5 bg-now rounded-full" />
                    </span>
                    Live
                  </span>
                )}
              </span>
              {today && liveSession && (
                <div className="mt-1 flex items-center gap-1 px-1 py-0.5 rounded bg-error/10 text-[8px] text-on-surface truncate">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: liveSubject?.color || 'var(--color-error)' }} />
                  <span className="truncate">{liveSubject?.name || 'Studying'} · live</span>
                </div>
              )}
              {dayEvents.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const subj = subjectMap[ev.subjectId];
                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-1 px-1 py-0.5 rounded text-[8px] text-on-surface truncate"
                      >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: subj?.color || 'var(--color-on-surface-variant)' }} />
                        <span className="truncate">{totalMinutes > 0 ? `${Math.round(minutesBetween(ev.start, ev.end))}m` : ''}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] text-on-surface-variant">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
