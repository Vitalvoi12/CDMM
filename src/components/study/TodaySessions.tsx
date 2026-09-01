import type { CalendarEvent, Subject } from '../../types';
import { minutesBetween } from '../../utils/time';
import { formatDuration } from '../../utils/time';

interface TodaySessionsProps {
  events: CalendarEvent[];
  subjects: Subject[];
  totalMinutes: number;
  currentEventId?: string;
}

export function TodaySessions({ events, subjects, totalMinutes, currentEventId }: TodaySessionsProps) {
  const subjectMap: Record<string, Subject> = {};
  subjects.forEach((s) => (subjectMap[s.id] = s));

  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return (
    <div className="flex-1 bg-surface-container-lowest p-8 lg:p-16 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-end justify-between mb-8 border-b border-outline-variant pb-4">
        <h3 className="font-headline-lg text-headline-lg text-primary-container uppercase tracking-tight">
          Today
        </h3>
        <span className="font-label-md text-label-md text-on-secondary-container uppercase tracking-widest">
          {formatDuration(totalMinutes)} Total
        </span>
      </div>
      <div className="flex flex-col flex-1 overflow-y-auto min-h-0">
        {sorted.map((event, i) => {
          const subject = subjectMap[event.subjectId];
          const mins = minutesBetween(event.start, event.end);
          const isCurrent = event.id === currentEventId;
          return (
            <div
              key={event.id}
              className={`flex flex-col border-b py-4 px-2 group cursor-default relative ${
                isCurrent
                  ? 'border-primary bg-surface-container-high'
                  : 'border-outline-variant hover:bg-surface-container-low transition-colors'
              }`}
            >
              {isCurrent && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              )}
              <div className="flex items-center justify-between pl-1">
                <div className="flex items-center gap-4">
                  <span className={`font-label-md text-label-md tabular-nums ${isCurrent ? 'text-primary' : 'text-on-secondary-container'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={`font-headline-md text-headline-md ${isCurrent ? 'text-primary' : 'text-primary-container'}`}>
                    {subject?.name || event.subjectId}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isCurrent && (
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  )}
                  <span className={`font-body-md text-body-md ${isCurrent ? 'text-primary font-semibold' : 'text-on-secondary-container'}`}>
                    {formatDuration(mins)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-body-md text-body-md text-on-surface-variant">No sessions today</p>
          </div>
        )}
      </div>
    </div>
  );
}
