import { useMemo } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { getEventsForDate } from '../../utils/stats';
import { minutesBetween } from '../../utils/time';

interface YearViewProps {
  date: Date;
  events: CalendarEvent[];
  subjects: Subject[];
}

export function YearView({ date, events }: YearViewProps) {
  const months = useMemo(() => {
    const yearStart = startOfYear(date);
    return Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(yearStart.getFullYear(), i, 1);
      return monthDate;
    });
  }, [date]);

  const monthlyData = useMemo(() => {
    return months.map((monthDate) => {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const daysInM = new Date(year, month + 1, 0).getDate();
      let totalMinutes = 0;
      for (let d = 1; d <= daysInM; d++) {
        const dayDate = new Date(year, month, d);
        // Real study time only — plan events never count toward totals.
        const dayEvents = getEventsForDate(events, dayDate).filter((e) => e.kind !== 'plan');
        dayEvents.forEach((e) => {
          totalMinutes += minutesBetween(e.start, e.end);
        });
      }
      return {
        month: monthDate,
        totalMinutes,
        label: monthDate.toLocaleDateString('en-US', { month: 'short' }),
      };
    });
  }, [events, months]);

  const maxMinutes = Math.max(...monthlyData.map((m) => m.totalMinutes), 1);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-2">
        {monthlyData.map((m, i) => {
          const percent = Math.round((m.totalMinutes / maxMinutes) * 100);
          const hours = Math.floor(m.totalMinutes / 60);
          const mins = m.totalMinutes % 60;
          return (
            <div
              key={i}
              className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 hover:border-primary transition-colors"
            >
              <div className="flex justify-between items-baseline mb-4">
                <span className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
                  {m.label}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {hours}h {mins}m
                </span>
              </div>
              <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}
