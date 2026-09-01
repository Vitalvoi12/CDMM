import { useMemo } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { getMonthGrid, formatDayOfMonth, isSameDay } from '../../utils/time';
import { getEventsForDate } from '../../utils/stats';
import { minutesBetween } from '../../utils/time';

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  subjects: Subject[];
  onDateSelect: (date: Date) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView({ date, events, subjects, onDateSelect }: MonthViewProps) {
  const grid = useMemo(() => getMonthGrid(date), [date]);
  const subjectMap = useMemo(() => {
    const m: Record<string, Subject> = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  return (
    <div className="flex-1">
      <div className="grid grid-cols-7 gap-px mb-4">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {grid.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} className="min-h-[80px] bg-surface-container-low/30" />;
          const dayEvents = getEventsForDate(events, d);
          const totalMinutes = dayEvents.reduce((sum, e) => sum + minutesBetween(e.start, e.end), 0);
          const today = isSameDay(d, new Date());
          return (
            <button
              key={i}
              onClick={() => onDateSelect(d)}
              className={`min-h-[80px] p-2 text-left transition-colors hover:bg-surface-container-low ${
                today ? 'bg-surface-container' : 'bg-surface-container-low/30'
              }`}
            >
              <span className={`font-label-sm text-label-sm ${today ? 'text-primary font-bold' : 'text-on-surface'}`}>
                {formatDayOfMonth(d)}
              </span>
              {dayEvents.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const subj = subjectMap[ev.subjectId];
                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] text-on-surface truncate"
                      >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: subj?.color || '#999' }} />
                        <span className="truncate">{totalMinutes > 0 ? `${Math.round(minutesBetween(ev.start, ev.end))}m` : ''}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-on-surface-variant">+{dayEvents.length - 3}</span>
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
