import { useMemo, useCallback, useRef, useState } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { getEventsForDate } from '../../utils/stats';
import { addDays, timeToPixels, timeFromDate, formatWeekdayShort, formatDayOfMonth, isSameDay } from '../../utils/time';
import { useIsMobile } from '../../hooks/useIsMobile';

interface MultiDayViewProps {
  date: Date;
  days: number;
  events: CalendarEvent[];
  subjects: Subject[];
  onEventMove?: (eventId: string, newStart: Date, newEnd: Date) => void;
  onEventResize?: (eventId: string, newEnd: Date) => void;
}

const START_HOUR = 8;
const END_HOUR = 20;
const HOUR_HEIGHT_DESKTOP = 48;
const MOBILE_SCALE = 2.5;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SNAP = 15;

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

export function MultiDayView({ date, days, events, subjects, onEventMove, onEventResize }: MultiDayViewProps) {
  const isMobile = useIsMobile();
  const HOUR_HEIGHT = isMobile ? Math.round(HOUR_HEIGHT_DESKTOP / MOBILE_SCALE) : HOUR_HEIGHT_DESKTOP;
  const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT;
  const subjectMap = useMemo(() => {
    const m: Record<string, Subject> = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  const dragRef = useRef({ eventId: '', startY: 0, deltaY: 0, eventStart: '', eventEnd: '' });
  const resizeRef = useRef({ eventId: '', startY: 0, deltaY: 0, eventEnd: '' });
  const [dragPos, setDragPos] = useState<{ eventId: string; deltaY: number } | null>(null);
  const [resizePos, setResizePos] = useState<{ eventId: string; deltaY: number } | null>(null);

  const dayList = useMemo(() => {
    return Array.from({ length: days }, (_, i) => addDays(date, i));
  }, [date, days]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) ticks.push(h);
    return ticks;
  }, []);

  const handleDragStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId: event.id, startY: e.clientY, deltaY: 0, eventStart: event.start, eventEnd: event.end };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - dragRef.current.startY;
      dragRef.current.deltaY = delta;
      setDragPos({ eventId: dragRef.current.eventId, deltaY: delta });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (dragRef.current.eventId && onEventMove) {
        const minsDelta = snapToGrid(Math.round(dragRef.current.deltaY * MINUTES_PER_PIXEL));
        if (minsDelta !== 0) {
          const origStart = new Date(dragRef.current.eventStart);
          const origEnd = new Date(dragRef.current.eventEnd);
          onEventMove(dragRef.current.eventId, new Date(origStart.getTime() + minsDelta * 60000), new Date(origEnd.getTime() + minsDelta * 60000));
        }
        setDragPos(null);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventMove]);

  const handleResizeStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { eventId: event.id, startY: e.clientY, deltaY: 0, eventEnd: event.end };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - resizeRef.current.startY;
      resizeRef.current.deltaY = delta;
      setResizePos({ eventId: resizeRef.current.eventId, deltaY: delta });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (resizeRef.current.eventId && onEventResize) {
        const minsDelta = snapToGrid(Math.round(resizeRef.current.deltaY * MINUTES_PER_PIXEL));
        if (minsDelta !== 0) {
          const origEnd = new Date(resizeRef.current.eventEnd);
          onEventResize(resizeRef.current.eventId, new Date(origEnd.getTime() + minsDelta * 60000));
        }
        setResizePos(null);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventResize]);

  return (
    <div className="flex-1 overflow-x-auto pb-2">
      <div className="flex h-full min-w-[240px]">
        {/* Time gutter */}
        <div className="w-12 flex-shrink-0">
          <div className="p-4" />
          {hourTicks.map((hour) => (
            <div key={hour} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
              <span className="absolute -top-2 right-1 max-lg:-top-1 max-lg:!text-[9px] max-lg:leading-none font-label-sm text-label-sm text-on-surface-variant">
                {String(hour).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
        {/* Day columns */}
        <div className="flex flex-1 min-w-0">
          {dayList.map((day) => {
            const today = isSameDay(day, new Date());
            const dayEvents = getEventsForDate(events, day).sort(
              (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
            );
            return (
              <div key={day.toISOString()} className="flex-1 min-w-[140px] max-w-full flex-shrink overflow-hidden">
                <div
                  className={`p-3 text-center border-b border-outline-variant ${today ? 'bg-surface-container' : ''}`}
                >
                  <span className={`font-label-sm text-label-sm uppercase tracking-widest ${today ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                    {formatWeekdayShort(day)}
                  </span>
                  <span className={`font-display-lg block mt-1 ${today ? 'text-primary' : 'text-on-surface'}`}>
                    {formatDayOfMonth(day)}
                  </span>
                </div>
                <div className="relative border-l border-outline-variant" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
                  {hourTicks.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-outline-variant/40"
                      style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                    />
                  ))}
                  {dayEvents.map((ev) => {
                    const top = timeToPixels(ev.start, START_HOUR, HOUR_HEIGHT);
                    const endPx = timeToPixels(ev.end, START_HOUR, HOUR_HEIGHT);
                    let height = Math.max(endPx - top, 16);
                    const subject = subjectMap[ev.subjectId];
                    const tiny = height < HOUR_HEIGHT * 0.5;
                    let visualTop = top;
                    if (dragPos?.eventId === ev.id) visualTop += dragPos.deltaY;
                    if (resizePos?.eventId === ev.id) height = Math.max(height + resizePos.deltaY, 16);
                    return (
                      <div
                        key={ev.id}
                        className="absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer hover:brightness-95 transition-all pl-2 pt-1 pb-1 pr-1 group"
                        style={{ top: `${visualTop}px`, height: `${height}px`, backgroundColor: subject?.color ? `${subject.color}15` : undefined }}
                        onMouseDown={(e) => handleDragStart(ev, e)}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: subject?.color || '#999' }} />
                        {tiny ? (
                          <span className="font-label-sm text-label-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface truncate" style={{ color: subject?.color }}>
                            {subject?.name}
                          </span>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: subject?.color || '#999' }} />
                              <span className="font-label-sm text-label-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface truncate">
                                {subject?.name}
                              </span>
                            </div>
                            {height > HOUR_HEIGHT * 0.67 && (
                              <span className="font-body-sm text-body-sm max-lg:!text-[8px] max-lg:leading-none text-on-surface-variant block truncate">
                                {timeFromDate(ev.start)} - {timeFromDate(ev.end)}
                              </span>
                            )}
                          </>
                        )}
                        {height >= HOUR_HEIGHT * 0.67 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleResizeStart(ev, e)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
