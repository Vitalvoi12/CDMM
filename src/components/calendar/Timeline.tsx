import { useMemo, useState, useCallback, useRef } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { timeToPixels } from '../../utils/time';
import { TimelineEvent } from './TimelineEvent';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { isToday } from '../../utils/time';

interface TimelineProps {
  events: CalendarEvent[];
  subjects: Subject[];
  date: Date;
  onEventClick?: (event: CalendarEvent) => void;
  onEventMove?: (eventId: string, newStart: Date, newEnd: Date) => void;
  onEventResize?: (eventId: string, newEnd: Date) => void;
}

const START_HOUR = 8;
const END_HOUR = 20;
const HOUR_HEIGHT = 96;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT;
const SNAP = 15;

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

export function Timeline({ events, subjects, date, onEventClick, onEventMove, onEventResize }: TimelineProps) {
  const [dragOffset, setDragOffset] = useState<{ eventId: string; deltaY: number } | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ eventId: string; deltaY: number } | null>(null);
  const dragRef = useRef({ eventId: '', startY: 0, deltaY: 0, eventStart: '', eventEnd: '' });
  const resizeRef = useRef({ eventId: '', startY: 0, deltaY: 0, eventEnd: '' });

  const subjectMap = useMemo(() => {
    const map: Record<string, Subject> = {};
    subjects.forEach((s) => (map[s.id] = s));
    return map;
  }, [subjects]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) ticks.push(h);
    return ticks;
  }, []);

  const eventBlocks = useMemo(() => {
    return events.map((event) => {
      const top = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
      const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
      const height = Math.max(endPx - top, 16);
      return { event, top, height };
    });
  }, [events]);

  const gapIndicators = useMemo(() => {
    const indicators: { top: number; height: number; duration: number }[] = [];
    const sorted = [...events].sort(
      (a, b) => new Date(a.end).getTime() - new Date(b.end).getTime()
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapStart = new Date(sorted[i].end).getTime();
      const gapEnd = new Date(sorted[i + 1].start).getTime();
      if (gapEnd > gapStart) {
        const gapMinutes = Math.round((gapEnd - gapStart) / 60000);
        if (gapMinutes < 120) {
          const topPx = timeToPixels(sorted[i].end, START_HOUR, HOUR_HEIGHT);
          const endPx = timeToPixels(sorted[i + 1].start, START_HOUR, HOUR_HEIGHT);
          indicators.push({ top: topPx, height: endPx - topPx, duration: gapMinutes });
        }
      }
    }
    return indicators;
  }, [events]);

  const handleDragStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      eventId: event.id,
      startY: e.clientY,
      deltaY: 0,
      eventStart: event.start,
      eventEnd: event.end,
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - dragRef.current.startY;
      dragRef.current.deltaY = delta;
      setDragOffset({ eventId: dragRef.current.eventId, deltaY: delta });
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
          const newStart = new Date(origStart.getTime() + minsDelta * 60000);
          const newEnd = new Date(origEnd.getTime() + minsDelta * 60000);
          onEventMove(dragRef.current.eventId, newStart, newEnd);
        }
        setDragOffset(null);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventMove]);

  const handleResizeStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      eventId: event.id,
      startY: e.clientY,
      deltaY: 0,
      eventEnd: event.end,
    };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - resizeRef.current.startY;
      resizeRef.current.deltaY = delta;
      setResizeInfo({ eventId: resizeRef.current.eventId, deltaY: delta });
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
          const newEnd = new Date(origEnd.getTime() + minsDelta * 60000);
          onEventResize(resizeRef.current.eventId, newEnd);
        }
        setResizeInfo(null);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventResize]);

  return (
    <section className="col-span-12 lg:col-span-8 flex flex-col relative">
      <div className="flex-1 relative border-l border-outline-variant ml-lg pr-4 lg:pr-6" style={{ paddingBottom: '64px' }}>
        {/* Events/grid container - shared coordinate system */}
        <div className="relative w-full" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Hour ticks at fixed positions */}
          {hourTicks.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-outline-variant"
              style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <span className="absolute -top-3 -left-12 font-label-sm text-label-sm text-on-surface-variant">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          ))}

          {/* Current time indicator */}
          {isToday(date) && <CurrentTimeIndicator />}

          {/* Gap indicators */}
          {gapIndicators.map((gap, i) => (
            <div
              key={i}
              className="absolute right-0 w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] flex items-center justify-center"
              style={{ top: `${gap.top}px`, height: `${gap.height}px` }}
            >
              <span className="font-label-sm text-label-sm text-on-surface-variant italic">
                {gap.duration} min gap
              </span>
            </div>
          ))}

          {/* Events */}
          {eventBlocks.map(({ event, top, height }) => {
            let visualTop = top;
            let visualHeight = height;
            if (dragOffset?.eventId === event.id) {
              visualTop += dragOffset.deltaY;
            }
            if (resizeInfo?.eventId === event.id) {
              visualHeight = Math.max(height + resizeInfo.deltaY, 16);
            }
            return (
              <TimelineEvent
                key={event.id}
                event={event}
                top={visualTop}
                height={visualHeight}
                subject={subjectMap[event.subjectId]}
                onClick={() => onEventClick?.(event)}
                onDragStart={(e) => handleDragStart(event, e)}
                onResizeStart={(e) => handleResizeStart(event, e)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
