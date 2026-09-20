import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { CalendarEvent, Subject, EventFilter } from '../../types';
import { timeToPixels, shiftEventByMinutes, shiftEventEndByMinutes } from '../../utils/time';
import { bodyZoom } from '../../utils/zoom';
import { TimelineEvent } from './TimelineEvent';
import { LiveEventBlock } from './LiveEventBlock';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { isToday } from '../../utils/time';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAvailableHeight } from '../../hooks/useAvailableHeight';

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
  /** Which kinds to show: 'all' (default) renders Real|Plan side by side,
      'real'/'plan' renders a single full-width column. */
  mode?: EventFilter;
}

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_HEIGHT_DESKTOP = 96;
/** Lower bound: below this the grid scrolls instead of compressing further.
 *  No upper bound — the grid must reach the bottom of the screen at any
 *  window height. */
const MIN_HOUR_HEIGHT = 24;
const MOBILE_SCALE = 2.5;
const SNAP = 15;
const LONG_PRESS_MS = 400;
const TOUCH_MOVE_THRESHOLD = 8;

interface TouchDragState {
  eventId: string;
  startY: number;
  startX: number;
  deltaY: number;
  moved: boolean;
  active: boolean;
  eventStart: string;
  eventEnd: string;
  minDelta: number;
  maxDelta: number;
  timer: number | null;
}

const emptyTouchDrag: TouchDragState = {
  eventId: '',
  startY: 0,
  startX: 0,
  deltaY: 0,
  moved: false,
  active: false,
  eventStart: '',
  eventEnd: '',
  minDelta: 0,
  maxDelta: 0,
  timer: null,
};

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

export function Timeline({ events, subjects, date, activeSession, onEventClick, onEventMove, onEventResize, onBackgroundClick, mode = 'all' }: TimelineProps) {
  const isMobile = useIsMobile();
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  // Single-column mode ('real' or 'plan'): the day is not split — one
  // full-width column showing only that kind.
  const single = mode !== 'all';
  const singleKind: 'real' | 'plan' = mode === 'plan' ? 'plan' : 'real';
  // Exact-fit on desktop AND mobile: the 6:00–24:00 grid always spans the
  // free vertical space (same rule as the 3-day/week view) so no dead space
  // is left below 24:00. Compresses down to MIN_HOUR_HEIGHT — shorter
  // screens keep scrolling. Fractional heights are fine: event math is
  // linear in HOUR_HEIGHT.
  const gridAnchorRef = useRef<HTMLDivElement>(null);
  const availPx = useAvailableHeight(gridAnchorRef);
  const BOTTOM_PAD = 51;
  const baseHourHeight = isMobile ? Math.round(HOUR_HEIGHT_DESKTOP / MOBILE_SCALE) : HOUR_HEIGHT_DESKTOP;
  const HOUR_HEIGHT = availPx > 0
    ? Math.max(MIN_HOUR_HEIGHT, (availPx - BOTTOM_PAD) / TOTAL_HOURS)
    : baseHourHeight;
  const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT;
  const [dragOffset, setDragOffset] = useState<{ eventId: string; deltaY: number } | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ eventId: string; deltaY: number } | null>(null);
  const dragRef = useRef({ eventId: '', startY: 0, deltaY: 0, moved: false, eventStart: '', eventEnd: '', minDelta: 0, maxDelta: 0 });
  const resizeRef = useRef({ eventId: '', startY: 0, deltaY: 0, moved: false, eventStart: '', eventEnd: '', minDelta: 0, maxDelta: 0 });
  const touchDragRef = useRef<TouchDragState>({ ...emptyTouchDrag });
  // Cleanup for an in-flight touch drag (listener removal + body style reset),
  // executed on unmount so a mid-drag unmount doesn't leak document listeners.
  const touchCleanupRef = useRef<(() => void) | null>(null);
  // Timestamp of the last drag/resize that actually moved the pointer: the
  // browser still fires a click on mouse-up, and without this guard it would
  // land on the background column and open the create form ("Add") right
  // after the user just moved an event.
  const lastDragEndRef = useRef(0);

  useEffect(() => {
    return () => {
      touchCleanupRef.current?.();
      touchCleanupRef.current = null;
    };
  }, []);

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
    const visible = mode === 'all' ? events : events.filter((e) => (e.kind ?? 'real') === mode);
    return visible.map((event) => {
      const top = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
      const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
      const height = Math.max(endPx - top, 13);
      return { event, top, height };
    });
  }, [events, mode, START_HOUR, HOUR_HEIGHT]);

  const gapIndicators = useMemo(() => {
    const indicators: { top: number; height: number; duration: number }[] = [];
    // Gaps only between VISIBLE real blocks (eventBlocks is pre-filtered).
    const sorted = [...eventBlocks.filter((b) => b.event.kind !== 'plan')].sort(
      (a, b) => new Date(a.event.end).getTime() - new Date(b.event.end).getTime()
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapStart = new Date(sorted[i].event.end).getTime();
      const gapEnd = new Date(sorted[i + 1].event.start).getTime();
      if (gapEnd > gapStart) {
        const gapMinutes = Math.round((gapEnd - gapStart) / 60000);
        if (gapMinutes < 120) {
          const topPx = timeToPixels(sorted[i].event.end, START_HOUR, HOUR_HEIGHT);
          const endPx = timeToPixels(sorted[i + 1].event.start, START_HOUR, HOUR_HEIGHT);
          indicators.push({ top: topPx, height: endPx - topPx, duration: gapMinutes });
        }
      }
    }
    return indicators;
  }, [eventBlocks, START_HOUR, HOUR_HEIGHT]);

  const handleDragStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const zoom = bodyZoom();
    const startPx = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
    const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
    const minDelta = -startPx;
    const maxDelta = TOTAL_HOURS * HOUR_HEIGHT - endPx;
    dragRef.current = {
      eventId: event.id,
      startY: e.clientY,
      deltaY: 0,
      moved: false,
      eventStart: event.start,
      eventEnd: event.end,
      minDelta,
      maxDelta,
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      // clientY is visual px, layout math is layout px (body zoom) —
      // normalize first so drag distance matches what the eye sees.
      const delta = (ev.clientY - dragRef.current.startY) / zoom;
      if (Math.abs(delta) > 4) dragRef.current.moved = true;
      const clamped = Math.max(dragRef.current.minDelta, Math.min(dragRef.current.maxDelta, delta));
      // Snap DURING the drag, same as resize: jump in 15-minute steps
      // instead of gliding smoothly.
      const minsDelta = snapToGrid(Math.round(clamped * MINUTES_PER_PIXEL));
      const { start } = shiftEventByMinutes(
        dragRef.current.eventStart,
        dragRef.current.eventEnd,
        minsDelta,
        START_HOUR,
        END_HOUR
      );
      const snappedDelta =
        ((start.getTime() - new Date(dragRef.current.eventStart).getTime()) / 60000) /
        MINUTES_PER_PIXEL;
      dragRef.current.deltaY = snappedDelta;
      setDragOffset({ eventId: dragRef.current.eventId, deltaY: snappedDelta });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (dragRef.current.moved) lastDragEndRef.current = Date.now();
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

  const handleTouchDragStart = useCallback((event: CalendarEvent, e: React.TouchEvent<HTMLElement>) => {
    if (!isMobile || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const startPx = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
    const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
    const state: TouchDragState = {
      eventId: event.id,
      startY: touch.clientY,
      startX: touch.clientX,
      deltaY: 0,
      moved: false,
      active: false,
      eventStart: event.start,
      eventEnd: event.end,
      minDelta: -startPx,
      maxDelta: TOTAL_HOURS * HOUR_HEIGHT - endPx,
      timer: null,
    };
    touchDragRef.current = state;
    const clearTimer = () => {
      if (touchDragRef.current.timer !== null) {
        window.clearTimeout(touchDragRef.current.timer);
        touchDragRef.current.timer = null;
      }
    };
    const onMove = (ev: TouchEvent) => {
      const current = touchDragRef.current;
      if (current.eventId !== event.id) return;
      const activeTouch = ev.touches[0] ?? ev.changedTouches[0];
      if (!activeTouch) return;
      if (!current.active) {
        if (
          Math.abs(activeTouch.clientY - current.startY) > TOUCH_MOVE_THRESHOLD ||
          Math.abs(activeTouch.clientX - current.startX) > TOUCH_MOVE_THRESHOLD
        ) {
          clearTimer();
        }
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const delta = (activeTouch.clientY - current.startY) / bodyZoom();
      if (Math.abs(delta) > 4) current.moved = true;
      const clamped = Math.max(current.minDelta, Math.min(current.maxDelta, delta));
      const minsDelta = snapToGrid(Math.round(clamped * MINUTES_PER_PIXEL));
      const { start } = shiftEventByMinutes(
        current.eventStart,
        current.eventEnd,
        minsDelta,
        START_HOUR,
        END_HOUR
      );
      current.deltaY =
        ((start.getTime() - new Date(current.eventStart).getTime()) / 60000) /
        MINUTES_PER_PIXEL;
      setDragOffset({ eventId: current.eventId, deltaY: current.deltaY });
    };
    const finish = (_ev: TouchEvent, cancelled: boolean) => {
      const current = touchDragRef.current;
      if (current.eventId !== event.id) return;
      clearTimer();
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!cancelled && current.active && current.moved && onEventMove) {
        const minsDelta = snapToGrid(Math.round(current.deltaY * MINUTES_PER_PIXEL));
        if (minsDelta !== 0) {
          const { start, end } = shiftEventByMinutes(
            current.eventStart,
            current.eventEnd,
            minsDelta,
            START_HOUR,
            END_HOUR
          );
          onEventMove(current.eventId, start, end);
        }
      }
      if (current.active) lastDragEndRef.current = Date.now();
      setDragOffset(null);
      touchDragRef.current = { ...emptyTouchDrag };
      touchCleanupRef.current = null;
    };
    const onEnd = (ev: TouchEvent) => finish(ev, false);
    const onCancel = (ev: TouchEvent) => finish(ev, true);
    state.timer = window.setTimeout(() => {
      const current = touchDragRef.current;
      if (current.eventId !== event.id || current.active) return;
      current.active = true;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }, LONG_PRESS_MS);
    touchCleanupRef.current = () => {
      clearTimer();
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
  }, [onEventMove, HOUR_HEIGHT, MINUTES_PER_PIXEL, TOTAL_HOURS, isMobile]);

  const handleResizeStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const zoom = bodyZoom();
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
      moved: false,
      eventStart: event.start,
      eventEnd: event.end,
      minDelta,
      maxDelta,
    };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientY - resizeRef.current.startY) / zoom;
      if (Math.abs(delta) > 4) resizeRef.current.moved = true;
      const clamped = Math.max(resizeRef.current.minDelta, Math.min(resizeRef.current.maxDelta, delta));
      // Snap DURING the drag: convert to 15-min steps first, then back to
      // pixels, so the block jumps in fixed steps instead of gliding smoothly.
      const minsDelta = snapToGrid(Math.round(clamped * MINUTES_PER_PIXEL));
      const snappedEnd = shiftEventEndByMinutes(
        resizeRef.current.eventEnd,
        resizeRef.current.eventStart,
        minsDelta,
        END_HOUR,
        SNAP
      );
      const snappedDelta =
        ((snappedEnd.getTime() - new Date(resizeRef.current.eventEnd).getTime()) / 60000) /
        MINUTES_PER_PIXEL;
      resizeRef.current.deltaY = snappedDelta;
      setResizeInfo({ eventId: resizeRef.current.eventId, deltaY: snappedDelta });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (resizeRef.current.moved) lastDragEndRef.current = Date.now();
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
        // Ignore the click the browser fires right after a drag/resize ended
        // over empty space — it is the tail of the move gesture, not a tap.
        if (Date.now() - lastDragEndRef.current < 500) return;
        const rect = e.currentTarget.getBoundingClientRect();
        // Visual px → layout px (body zoom) before converting to minutes.
        const minutes = snapToGrid(Math.round(((e.clientY - rect.top) / bodyZoom()) * MINUTES_PER_PIXEL));
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
        visualHeight = Math.max(height + resizeInfo.deltaY, 13);
      }
      return (
        <TimelineEvent
          key={event.id}
          event={event}
          top={visualTop}
          height={visualHeight}
          hourHeight={HOUR_HEIGHT}
          isMobile={isMobile}
          subject={subjectMap[event.subjectId]}
          onClick={(e) => {
            if (Date.now() - lastDragEndRef.current < 500) return;
            e?.stopPropagation();
            onEventClick?.(event);
          }}
          onTouchStart={(e) => handleTouchDragStart(event, e)}
          onDragStart={(e) => handleDragStart(event, e)}
          onResizeStart={(e) => handleResizeStart(event, e)}
        />
      );
    });

  const realBlocks = eventBlocks.filter((b) => b.event.kind !== 'plan');
  const planBlocks = eventBlocks.filter((b) => b.event.kind === 'plan');

  return (
    <section className="col-span-12 lg:col-span-8 flex flex-col relative min-h-0 overflow-y-auto">
      <div className="flex-1 relative border-l border-outline-variant ml-12 pr-4 lg:pr-6" style={{ paddingBottom: `${BOTTOM_PAD}px` }}>
        <div className={`flex items-center mb-2 pl-4 ${single ? 'justify-center' : 'justify-between'}`}>
          {single ? (
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">{singleKind === 'real' ? 'Real' : 'Plan'}</span>
          ) : (
            <>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">Real</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">Plan</span>
            </>
          )}
        </div>
        {/* Events/grid container - shared coordinate system.
            The fill anchor sits HERE (not on the wrapper above): avail is
            measured from the grid top, so the Real/Plan header row above
            must not be part of the measured space. */}
        <div ref={gridAnchorRef} className="relative w-full" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
          {/* Hour ticks at fixed positions */}
          {hourTicks.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-outline-variant/60"
              style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              <span className="absolute -top-2.5 -left-12 max-lg:-top-1 max-lg:!text-[7px] max-lg:leading-none font-label-sm text-label-sm text-on-surface-variant tabular-nums">
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
              <span className="font-label-sm text-label-sm max-lg:!text-[7px] max-lg:leading-none text-on-surface-variant italic">
                {gap.duration} min gap
              </span>
            </div>
          ))}

          {/* Single-kind mode: one full-width column, no split. The live
              session block is real — hidden in plan-only mode. */}
          {single ? (
            <div className="absolute left-0 right-0 top-0 bottom-0" onClick={makeColumnTapHandler(singleKind)}>
              {renderEventBlocks(singleKind === 'real' ? realBlocks : planBlocks)}
              {isToday(date) && activeSession && singleKind === 'real' && (
                <LiveEventBlock
                  start={activeSession.start}
                  startHour={START_HOUR}
                  endHour={END_HOUR}
                  hourHeight={HOUR_HEIGHT}
                  subject={subjectMap[activeSession.subjectId]}
                />
              )}
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* Current time indicator — last in DOM so it paints above event
              blocks and the live session block (see zIndex inside). */}
          {isToday(date) && <CurrentTimeIndicator startHour={START_HOUR} endHour={END_HOUR} hourHeight={HOUR_HEIGHT} />}
        </div>
      </div>
    </section>
  );
}
