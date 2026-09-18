import type { CalendarEvent, Subject } from '../../types';
import { minutesBetween } from '../../utils/time';
import { formatDuration } from '../../utils/time';

interface TodaySessionsProps {
  events: CalendarEvent[];
  subjects: Subject[];
  totalMinutes: number;
  currentEventId?: string;
  /** Running live session (not yet a stored event) — shown as the last row. */
  liveSession?: { subjectId: string; start: string; elapsedMs: number } | null;
}

export function TodaySessions({ events, subjects, totalMinutes, currentEventId, liveSession }: TodaySessionsProps) {
  const subjectMap: Record<string, Subject> = {};
  subjects.forEach((s) => (subjectMap[s.id] = s));

  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const liveSubject = liveSession ? subjectMap[liveSession.subjectId] : undefined;
  const liveMinutes = liveSession ? Math.floor(liveSession.elapsedMs / 60000) : 0;

  return (
    <div className="flex-1 bg-surface-container-lowest p-8 lg:p-16 max-lg:p-4 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-end justify-between mb-8 max-lg:mb-3 border-b border-outline-variant pb-4 max-lg:pb-2">
        <h3 className="font-headline-lg text-headline-lg max-lg:!text-[16px] text-primary-container uppercase tracking-tight">
          Today
        </h3>
        <span className="font-label-md text-label-md max-lg:!text-[10px] text-on-secondary-container uppercase tracking-widest">
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
              className={`flex flex-col border-b py-4 max-lg:py-2 px-2 group cursor-default relative ${
                isCurrent
                  ? 'border-primary bg-surface-container-high'
                  : 'border-outline-variant hover:bg-surface-container-low transition-colors'
              }`}
            >
              {isCurrent && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              )}
              <div className="flex items-center justify-between pl-1">
                <div className="flex items-center gap-4 max-lg:gap-2">
                  <span className={`font-label-md text-label-md max-lg:!text-[10px] tabular-nums ${isCurrent ? 'text-primary' : 'text-on-secondary-container'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={`font-headline-md text-headline-md max-lg:!text-[13px] ${isCurrent ? 'text-primary' : 'text-primary-container'}`}>
                    {subject?.name || event.title || 'Untitled'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isCurrent && (
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  )}
                  <span className={`font-body-md text-body-md max-lg:!text-[11px] ${isCurrent ? 'text-primary font-semibold' : 'text-on-secondary-container'}`}>
                    {formatDuration(mins)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && !liveSession && (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-body-md text-body-md max-lg:!text-[12px] text-on-surface-variant">No sessions today</p>
          </div>
        )}
        {liveSession && (
          <div className="flex flex-col border-b py-4 max-lg:py-2 px-2 group cursor-default relative border-primary bg-surface-container-high">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
            <div className="flex items-center justify-between pl-1">
              <div className="flex items-center gap-4 max-lg:gap-2">
                <span className="font-label-md text-label-md max-lg:!text-[10px] tabular-nums text-primary">
                  {String(sorted.length + 1).padStart(2, '0')}
                </span>
                <span className="font-headline-md text-headline-md max-lg:!text-[13px] text-primary">
                  {liveSubject?.name || 'Live session'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                <span className="font-body-md text-body-md max-lg:!text-[11px] text-primary font-semibold">
                  {formatDuration(liveMinutes)} · live
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
