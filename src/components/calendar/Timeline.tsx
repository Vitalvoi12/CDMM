import { useMemo, useState, useCallback, useRef } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { timeToPixels, shiftEventByMinutes, shiftEventEndByMinutes } from '../../utils/time';
import { TimelineEvent } from './TimelineEvent';
import { LiveEventBlock } from './LiveEventBlock';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { isToday } from '../../utils/time';
import { useIsMobile } from '../../hooks/useIsMobile';

interface TimelineProps {
  events: CalendarEvent[];
  subjects: Subject[];
  date: Date;
  /** Running study session (start ISO + subject id) — rendered transiently in the Real column. */
  activeSession?: { subjectId: string; start: string } | null;
  onEventClick?: (event: CalendarEvent) => void;
  onEventMove?: (eventId: string, newStart: Date, newEnd: Date) => void;
  onEventResize?: (eventId: string, newEnd: Date) => void;
  onBackgroundClick?: (start: Date, kind: 'real' | 'plan') => void;
}

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_HEIGHT_DESKTOP = 96;
const MOBILE_SCALE = 2.5;
const SNAP = 15;

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

export function Timeline({ events, subjects, date, activeSession, onEventClick, onEventMove, onEventResize, onBackgroundClick }: TimelineProps) {
  const isMobile = useIsMobile();
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = isMobile ? Math.round(HOUR_HEIGHT_DESKTOP / MOBILE_SCALE) : HOUR_HEIGHT_DESKTOP;
  const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT;
  const [dragOffset, setDragOffset] = useState<{ eventId: string; deltaY: number } | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ eventId: string; deltaY: number } | null>(null);
  const dragRef = useRef({ eventId: '', startY: 0, deltaY: 0, eventStart: '', eventEnd: '', minDelta: 0, maxDelta: 0 });
  const resizeRef = useRef({ eventId: '', startY: 0, deltaY: 0, eventStart: '', eventEnd: '', minDelta: 0, maxDelta: 0 });

  const subjectMap = useMemo(() => {
    const map: Record<string, Subject> = {};
    subjects.forEach((s) => (map[s.id] = s));
    return map;
  }, [subjects]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) ticks.push(h);
    return ticks;
  }, [START_HOUR, END_HOUR]);

  const eventBlocks = useMemo(() => {
    return events.map((event) => {
      const top = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
      const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
      const height = Math.max(endPx - top, 16);
      return { event, top, height };
    });
  }, [events, START_HOUR, HOUR_HEIGHT]);

  const gapIndicators = useMemo(() => {
    const indicators: { top: number; height: number; duration: number }[] = [];
    const sorted = [...events.filter((e) => e.kind !== 'plan')].sort(
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
  }, [events, START_HOUR, HOUR_HEIGHT]);

  const handleDragStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const startPx = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
    const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
    const minDelta = -startPx;
    const maxDelta = TOTAL_HOURS * HOUR_HEIGHT - endPx;
    dragRef.current = {
      eventId: event.id,
      startY: e.clientY,
      deltaY: 0,
      eventStart: event.start,
      eventEnd: event.end,
      minDelta,
      maxDelta,
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - dragRef.current.startY;
      const clamped = Math.max(dragRef.current.minDelta, Math.min(dragRef.current.maxDelta, delta));
      dragRef.current.deltaY = clamped;
      setDragOffset({ eventId: dragRef.current.eventId, deltaY: clamped });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (dragRef.current.eventId && onEventMove) {
        const minsDelta = snapToGrid(Math.round(dragRef.current.deltaY * MINUTES_PER_PIXEL));
        if (minsDelta !== 0) {
          const { start, end } = shiftEventByMinutes(
            dragRef.current.eventStart,
            dragRef.current.eventEnd,
            minsDelta,
            START_HOUR,
            END_HOUR
          );
          onEventMove(dragRef.current.eventId, start, end);
        }
        setDragOffset(null);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventMove, HOUR_HEIGHT, isMobile]);

  const handleResizeStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const startPx = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
    const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
    // Allow shrinking down to the 15-minute minimum: the pixel delta needed to
    // reach start + 15min from the current end.
    const minDelta = startPx - endPx + (SNAP * HOUR_HEIGHT) / 60;
    const maxDelta = TOTAL_HOURS * HOUR_HEIGHT - endPx;
    resizeRef.current = {
      eventId: event.id,
      startY: e.clientY,
      deltaY: 0,
      eventStart: event.start,
      eventEnd: event.end,
      minDelta,
      maxDelta,
    };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - resizeRef.current.startY;
      const clamped = Math.max(resizeRef.current.minDelta, Math.min(resizeRef.current.maxDelta, delta));
      resizeRef.current.deltaY = clamped;
      setResizeInfo({ eventId: resizeRef.current.eventId, deltaY: clamped });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (resizeRef.current.eventId && onEventResize) {
        const minsDelta = snapToGrid(Math.round(resizeRef.current.deltaY * MINUTES_PER_PIXEL));
        if (minsDelta !== 0) {
          const newEnd = shiftEventEndByMinutes(
            resizeRef.current.eventEnd,
            resizeRef.current.eventStart,
            minsDelta,
            END_HOUR,
            SNAP
          );
          onEventResize(resizeRef.current.eventId, newEnd);
        }
        setResizeInfo(null);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventResize, HOUR_HEIGHT, isMobile]);

  const makeColumnTapHandler = useCallback(
    (kind: 'real' | 'plan') =>
      (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const minutes = snapToGrid(Math.round((e.clientY - rect.top) * MINUTES_PER_PIXEL));
        const clamped = Math.max(0, Math.min(minutes, TOTAL_HOURS * 60 - SNAP));
        const start = new Date(date);
        start.setHours(START_HOUR + Math.floor(clamped / 60), clamped % 60, 0, 0);
        onBackgroundClick?.(start, kind);
      },
    [date, MINUTES_PER_PIXEL, onBackgroundClick]
  );

  const renderEventBlocks = (list: typeof eventBlocks) =>
    list.map(({ event, top, height }) => {
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
          hourHeight={HOUR_HEIGHT}
          subject={subjectMap[event.subjectId]}
          onClick={(e) => {
            e?.stopPropagation();
            onEventClick?.(event);
          }}
          onDragStart={(e) => handleDragStart(event, e)}
          onResizeStart={(e) => handleResizeStart(event, e)}
        />
      );
    });

  const realBlocks = eventBlocks.filter((b) => b.event.kind !== 'plan');
  const planBlocks = eventBlocks.filter((b) => b.event.kind === 'plan');

  return (
    <section className="col-span-12 lg:col-span-8 flex flex-col relative">
      <div className="flex-1 relative border-l border-outline-variant ml-12 pr-4 lg:pr-6" style={{ paddingBottom: '64px' }}>
        <div className="flex items-center justify-between mb-1 pl-4">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Real</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Plan</span>
        </div>
        {/* Events/grid container - shared coordinate system */}
        <div className="relative w-full" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Hour ticks at fixed positions */}
          {hourTicks.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-outline-variant"
              style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <span className="absolute -top-3 -left-12 max-lg:-top-1 max-lg:!text-[9px] max-lg:leading-none font-label-sm text-label-sm text-on-surface-variant">
                {String(hour % 24).padStart(2, '0')}:00
              </span>
            </div>
          ))}

          {/* Gap indicators (real column only) */}
          {gapIndicators.map((gap, i) => (
            <div
              key={i}
              className="absolute left-0 w-1/2 flex items-center justify-center pointer-events-none"
              style={{ top: `${gap.top}px`, height: `${gap.height}px` }}
            >
              <span className="font-label-sm text-label-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant italic">
                {gap.duration} min gap
              </span>
            </div>
          ))}

          {/* Left column: real events */}
          <div className="absolute left-0 top-0 bottom-0 w-1/2" onClick={makeColumnTapHandler('real')}>
            {renderEventBlocks(realBlocks)}
            {isToday(date) && activeSession && (
              <LiveEventBlock
                start={activeSession.start}
                startHour={START_HOUR}
                endHour={END_HOUR}
                hourHeight={HOUR_HEIGHT}
                subject={subjectMap[activeSession.subjectId]}
              />
            )}
          </div>

          {/* Divider between columns */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-outline-variant" />

          {/* Right column: plan events */}
          <div className="absolute right-0 top-0 bottom-0 w-1/2" onClick={makeColumnTapHandler('plan')}>
            {renderEventBlocks(planBlocks)}
          </div>

          {/* Current time indicator — last in DOM so it paints above event
              blocks and the live session block (see zIndex inside). */}
          {isToday(date) && <CurrentTimeIndicator startHour={START_HOUR} endHour={END_HOUR} hourHeight={HOUR_HEIGHT} />}
        </div>
      </div>
    </section>
  );
}
