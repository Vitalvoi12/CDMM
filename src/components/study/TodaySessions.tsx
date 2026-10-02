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

  const renderRow = (
    key: string,
    index: number,
    name: string,
    color: string | undefined,
    duration: string,
    opts: { highlight?: boolean; live?: boolean } = {}
  ) => (
    <div
      key={key}
      style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
      className={`relative flex items-center gap-3 px-4 py-3 max-lg:px-3 max-lg:py-2 rounded-xl border transition-colors animate-fade-up ${
        opts.highlight
          ? 'border-outline bg-surface-container'
          : 'border-outline-variant bg-transparent hover:border-outline'
      }`}
    >
      {opts.highlight && (
        <span className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full" style={{ backgroundColor: color || 'var(--color-primary)' }} />
      )}
      <span className="font-label-sm text-label-sm max-lg:!text-[8px] tabular-nums text-on-surface-variant w-6 flex-shrink-0">
        {String(index).padStart(2, '0')}
      </span>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color || 'var(--color-on-surface-variant)' }} />
      <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface truncate min-w-0 flex-1">
        {name}
      </span>
      {opts.live && <span className="w-1.5 h-1.5 bg-now rounded-full animate-pulse flex-shrink-0" />}
      <span className={`font-body-sm text-body-sm max-lg:!text-[9px] tabular-nums flex-shrink-0 ${opts.live ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
        {duration}
      </span>
    </div>
  );

  return (
    <div className="flex-1 p-8 lg:p-12 max-lg:p-4 flex flex-col gap-4 max-lg:gap-3 min-h-0 overflow-y-auto">
      <div className="w-full max-w-xl mx-auto bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 max-lg:p-4 flex flex-col min-h-0 max-h-full flex-shrink-0">
        <div className="flex items-center justify-between mb-5 max-lg:mb-3 flex-shrink-0">
          <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-[0.18em]">
            Today
          </h3>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.14em] tabular-nums">
            {formatDuration(totalMinutes)} total
          </span>
        </div>
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
          {sorted.map((event, i) => {
            const subject = subjectMap[event.subjectId];
            const mins = minutesBetween(event.start, event.end);
            const isCurrent = event.id === currentEventId;
            return renderRow(
              event.id,
              i + 1,
              subject?.name || event.title || 'Untitled',
              subject?.color,
              formatDuration(mins),
              { highlight: isCurrent, live: isCurrent }
            );
          })}
          {liveSession &&
            renderRow(
              'live',
              sorted.length + 1,
              liveSubject?.name || 'Live session',
              liveSubject?.color,
              `${formatDuration(liveMinutes)} · live`,
              { highlight: true, live: true }
            )}
          {sorted.length === 0 && !liveSession && (
            <div className="border border-dashed border-outline-variant rounded-xl py-10 px-4 flex items-center justify-center">
              <p className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface-variant">No sessions today</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
