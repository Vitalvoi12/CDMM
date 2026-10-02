import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import type { CalendarEvent, Subject, EventFilter } from '../../types';
import { getEventsForDate } from '../../utils/stats';
import { addDays, startOfWeek, timeToPixels, timeFromDate, formatWeekdayShort, formatDayOfMonth, isSameDay, shiftEventByMinutes, shiftEventEndByMinutes, layoutOverlapLanes } from '../../utils/time';
import { bodyZoom } from '../../utils/zoom';
import { CurrentTimeIndicator } from './CurrentTimeIndicator';
import { LiveEventBlock } from './LiveEventBlock';
import { contrastOn, eventFillColor, isDarkTheme, pageBackground } from '../../utils/color';
import { canResizeEvent, eventLayout, eventResizeZone } from '../../utils/eventDensity';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAvailableHeight } from '../../hooks/useAvailableHeight';
import { useSwipeNav } from '../../hooks/useSwipeNav';

interface MultiDayViewProps {
  date: Date;
  days: number;
  events: CalendarEvent[];
  subjects: Subject[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventMove?: (eventId: string, newStart: Date, newEnd: Date) => void;
  onEventResize?: (eventId: string, newEnd: Date) => void;
  onDateSelect?: (date: Date) => void;
  onBackgroundClick?: (start: Date, kind: 'real' | 'plan') => void;
  /** Which kinds to show: 'all' (default) splits each day into Real|Plan
      halves, 'real'/'plan' renders each day as a single full-width column. */
  mode?: EventFilter;
  /** Running study session — rendered transiently in the Real column of today's date. */
  activeSession?: { subjectId: string; start: string; pausedAt?: string | null } | null;
  /** Mobile swipe navigation (wired by the parent only on mobile). */
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const START_HOUR = 5;
const END_HOUR = 24;
const HOUR_HEIGHT_DESKTOP = 48;
/** Lower bound: below this the grid scrolls instead of compressing further.
 *  No upper bound — the grid must reach the bottom of the screen at any
 *  window height. */
const MIN_HOUR_HEIGHT = 24;
const MOBILE_SCALE = 2.5;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SNAP = 15;
const LONG_PRESS_MS = 400;
const TOUCH_MOVE_THRESHOLD = 8;

interface TouchDragState {
  eventId: string;
  dayIdx: number;
  targetDayIdx: number;
  startX: number;
  startY: number;
  deltaY: number;
  deltaX: number;
  moved: boolean;
  active: boolean;
  eventStart: string;
  eventEnd: string;
  minDelta: number;
  maxDelta: number;
  timer: number | null;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

export function MultiDayView({ date, days, events, subjects, onEventClick, onEventMove, onEventResize, onDateSelect, onBackgroundClick, mode = 'all', activeSession = null, onSwipeLeft, onSwipeRight }: MultiDayViewProps) {
  const isMobile = useIsMobile();
  const baseHourHeight = isMobile ? Math.round(HOUR_HEIGHT_DESKTOP / MOBILE_SCALE) : HOUR_HEIGHT_DESKTOP;
  // Single-column mode ('real' or 'plan'): day cells are not split.
  const single = mode !== 'all';
  const singleKind: 'real' | 'plan' = mode === 'plan' ? 'plan' : 'real';
  // Exact-fit: the 5:00–24:00 grid always spans the free vertical space so
  // no dead space is left below the last hour line. Compresses down to
  // MIN_HOUR_HEIGHT (shorter screens scroll instead), grows unbounded on
  // tall screens. Fractional heights are fine: all event math is linear
  // in HOUR_HEIGHT.
  const gridAnchorRef = useRef<HTMLDivElement>(null);
  const availPx = useAvailableHeight(gridAnchorRef);
  const HOUR_HEIGHT = availPx > 0 ? Math.max(MIN_HOUR_HEIGHT, availPx / TOTAL_HOURS) : baseHourHeight;
  const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT;
  const subjectMap = useMemo(() => {
    const m: Record<string, Subject> = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  const dragRef = useRef({ eventId: '', startY: 0, startX: 0, deltaY: 0, moved: false, originDayIdx: 0, targetDayIdx: 0, dayKeys: [] as number[], eventStart: '', eventEnd: '', minDelta: 0, maxDelta: 0 });
  const resizeRef = useRef({ eventId: '', startY: 0, deltaY: 0, moved: false, eventStart: '', eventEnd: '', minDelta: 0, maxDelta: 0 });
  const [dragPos, setDragPos] = useState<{ eventId: string; deltaY: number; deltaX: number; targetDayIdx: number } | null>(null);
  const [resizePos, setResizePos] = useState<{ eventId: string; deltaY: number } | null>(null);
  const touchDragRef = useRef<TouchDragState | null>(null);
  const touchCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      touchCleanupRef.current?.();
      touchCleanupRef.current = null;
    };
  }, []);
  // Day grid cells for mapping the pointer X to a target day during cross-day drags.
  const dayGridRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Timestamp of the last drag/resize that actually moved the pointer: the
  // browser still fires a click on mouse-up, and without this guard it would
  // land on the background cell and open the create form right after a move.
  // View swipes stamp it too, so the tap synthesized after a swipe never
  // opens the form.
  const lastDragEndRef = useRef(0);
  // Mobile swipe navigation (enabled by the parent on mobile only).
  const swipe = useSwipeNav({
    enabled: isMobile,
    onSwipeLeft,
    onSwipeRight,
    markGesture: () => {
      lastDragEndRef.current = Date.now();
    },
  });

  const dayList = useMemo(() => {
    // Week view is always a full Monday–Sunday week; shorter ranges stay
    // anchored at the selected day.
    const anchor = days >= 7 ? startOfWeek(date) : date;
    return Array.from({ length: days }, (_, i) => addDays(anchor, i));
  }, [date, days]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) ticks.push(h);
    return ticks;
  }, []);

  const handleDragStart = useCallback((event: CalendarEvent, dayIdx: number, e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    // clientY is visual px, layout math is layout px (body zoom).
    const zoom = bodyZoom();
    const startPx = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
    const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
    const minDelta = -startPx;
    const maxDelta = TOTAL_HOURS * HOUR_HEIGHT - endPx;
    dragRef.current = {
      eventId: event.id,
      startY: e.clientY,
      startX: e.clientX,
      deltaY: 0,
      moved: false,
      originDayIdx: dayIdx,
      targetDayIdx: dayIdx,
      dayKeys: dayList.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()),
      eventStart: event.start,
      eventEnd: event.end,
      minDelta,
      maxDelta,
    };
    const colCount = dayList.length;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const R = dragRef.current;
      const delta = (ev.clientY - R.startY) / zoom;
      if (Math.abs(delta) > 4 || Math.abs(ev.clientX - R.startX) > 4) R.moved = true;
      const clamped = Math.max(R.minDelta, Math.min(R.maxDelta, delta));
      // Snap DURING the drag, same as resize: jump in 15-minute steps
      // instead of gliding smoothly.
      const minsDelta = snapToGrid(Math.round(clamped * MINUTES_PER_PIXEL));
      const { start } = shiftEventByMinutes(
        R.eventStart,
        R.eventEnd,
        minsDelta,
        START_HOUR,
        END_HOUR
      );
      const snappedDelta =
        ((start.getTime() - new Date(R.eventStart).getTime()) / 60000) /
        MINUTES_PER_PIXEL;
      R.deltaY = snappedDelta;
      // Cross-day: map the pointer X to a target day column.
      let targetIdx = R.originDayIdx;
      let dxPx = 0;
      const cells = dayGridRefs.current;
      const originRect = cells[R.originDayIdx]?.getBoundingClientRect();
      const firstRect = cells[0]?.getBoundingClientRect();
      const lastRect = cells[colCount - 1]?.getBoundingClientRect();
      if (originRect && firstRect && lastRect) {
        if (ev.clientX <= firstRect.left) {
          targetIdx = 0;
        } else if (ev.clientX >= lastRect.right) {
          targetIdx = colCount - 1;
        } else {
          for (let i = 0; i < colCount; i++) {
            const r = cells[i]?.getBoundingClientRect();
            if (r && ev.clientX >= r.left && ev.clientX <= r.right) {
              targetIdx = i;
              break;
            }
          }
        }
        const targetRect = cells[targetIdx]?.getBoundingClientRect();
        if (targetRect) dxPx = targetRect.left - originRect.left;
      }
      R.targetDayIdx = targetIdx;
      setDragPos({ eventId: R.eventId, deltaY: snappedDelta, deltaX: dxPx, targetDayIdx: targetIdx });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (dragRef.current.moved) lastDragEndRef.current = Date.now();
      if (dragRef.current.eventId && onEventMove) {
        const R = dragRef.current;
        const minsDelta = snapToGrid(Math.round(R.deltaY * MINUTES_PER_PIXEL));
        const { start, end } = shiftEventByMinutes(
          R.eventStart,
          R.eventEnd,
          minsDelta,
          START_HOUR,
          END_HOUR
        );
        // Transplant the wall-clock time onto the target day.
        let ns = start;
        let ne = end;
        const dayShift = R.targetDayIdx - R.originDayIdx;
        if (dayShift !== 0 && R.dayKeys[R.targetDayIdx] !== undefined) {
          const dayMs = R.dayKeys[R.targetDayIdx];
          const atDay = (d: Date) => {
            const nd = new Date(dayMs);
            nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
            return nd;
          };
          ns = atDay(start);
          ne = new Date(ns.getTime() + (end.getTime() - start.getTime()));
        }
        if (minsDelta !== 0 || dayShift !== 0) {
          onEventMove(R.eventId, ns, ne);
        }
        setDragPos(null);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventMove, HOUR_HEIGHT, isMobile, dayList]);

  const handleTouchDragStart = useCallback((event: CalendarEvent, dayIdx: number, e: React.TouchEvent<HTMLElement>) => {
    if (!isMobile || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const topPx = timeToPixels(event.start, START_HOUR, HOUR_HEIGHT);
    const endPx = timeToPixels(event.end, START_HOUR, HOUR_HEIGHT);
    const state: TouchDragState = {
      eventId: event.id,
      dayIdx,
      targetDayIdx: dayIdx,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaY: 0,
      deltaX: 0,
      moved: false,
      active: false,
      eventStart: event.start,
      eventEnd: event.end,
      minDelta: -topPx,
      maxDelta: TOTAL_HOURS * HOUR_HEIGHT - endPx,
      timer: null,
    };
    touchDragRef.current = state;
    const clearTimer = () => {
      if (state.timer !== null) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
    };
    const onMove = (ev: TouchEvent) => {
      const current = touchDragRef.current;
      if (!current || current.eventId !== event.id) return;
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
      if (Math.abs(activeTouch.clientY - current.startY) > 4) current.moved = true;
      const delta = (activeTouch.clientY - current.startY) / bodyZoom();
      const clamped = Math.max(current.minDelta, Math.min(current.maxDelta, delta));
      const minsDelta = snapToGrid(Math.round(clamped / (HOUR_HEIGHT / 60)));
      const { start } = shiftEventByMinutes(
        current.eventStart,
        current.eventEnd,
        minsDelta,
        START_HOUR,
        END_HOUR
      );
      const snappedDelta =
        ((new Date(start).getTime() - new Date(current.eventStart).getTime()) / 60000) /
        (HOUR_HEIGHT / 60);
      current.deltaY = snappedDelta;
      let targetIdx = current.dayIdx;
      let dxPx = 0;
      const horizontalIntent =
        Math.abs(activeTouch.clientX - current.startX) > 12 &&
        Math.abs(activeTouch.clientX - current.startX) > Math.abs(activeTouch.clientY - current.startY) * 0.6;
      const cells = dayGridRefs.current;
      const colCount = dayList.length;
      const originRect = cells[current.dayIdx]?.getBoundingClientRect();
      const firstRect = cells[0]?.getBoundingClientRect();
      const lastRect = cells[colCount - 1]?.getBoundingClientRect();
      if (horizontalIntent && originRect && firstRect && lastRect) {
        if (activeTouch.clientX <= firstRect.left) {
          targetIdx = 0;
        } else if (activeTouch.clientX >= lastRect.right) {
          targetIdx = colCount - 1;
        } else {
          for (let i = 0; i < colCount; i++) {
            const r = cells[i]?.getBoundingClientRect();
            if (r && activeTouch.clientX >= r.left && activeTouch.clientX <= r.right) {
              targetIdx = i;
              break;
            }
          }
        }
        const targetRect = cells[targetIdx]?.getBoundingClientRect();
        if (targetRect) dxPx = targetRect.left - originRect.left;
      }
      current.targetDayIdx = targetIdx;
      current.deltaX = dxPx;
      setDragPos({ eventId: current.eventId, deltaY: snappedDelta, deltaX: dxPx, targetDayIdx: targetIdx });
    };
    const finish = (_ev: TouchEvent, cancelled: boolean) => {
      const current = touchDragRef.current;
      touchDragRef.current = null;
      clearTimer();
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      document.body.style.userSelect = '';
      if (current && current.eventId === event.id) {
        if (current.moved) lastDragEndRef.current = Date.now();
        if (!cancelled && current.active && current.moved && onEventMove) {
          const minsDelta = snapToGrid(Math.round((current.deltaY * HOUR_HEIGHT) / 60));
          const { start, end } = shiftEventByMinutes(
            current.eventStart,
            current.eventEnd,
            minsDelta,
            START_HOUR,
            END_HOUR
          );
          let ns = start;
          let ne = end;
          const dayShift = current.targetDayIdx - current.dayIdx;
          if (dayShift !== 0) {
            const targetDay = dayList[Math.max(0, Math.min(dayList.length - 1, current.targetDayIdx))];
            if (targetDay) {
              const targetMs = new Date(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate()).getTime();
              const atDay = (d: Date) => {
                const nd = new Date(targetMs);
                nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
                return nd;
              };
              ns = atDay(start);
              ne = new Date(ns.getTime() + (end.getTime() - start.getTime()));
            }
          }
          if (minsDelta !== 0 || dayShift !== 0) {
            onEventMove(current.eventId, ns, ne);
          }
        }
      }
      setDragPos(null);
      touchCleanupRef.current = null;
    };
    const onEnd = (ev: TouchEvent) => finish(ev, false);
    const onCancel = (ev: TouchEvent) => finish(ev, true);
    state.timer = window.setTimeout(() => {
      if (touchDragRef.current !== state || state.active) return;
      state.active = true;
      setDragPos({ eventId: state.eventId, deltaY: 0, deltaX: 0, targetDayIdx: state.dayIdx });
    }, LONG_PRESS_MS);
    touchCleanupRef.current = () => {
      clearTimer();
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      document.body.style.userSelect = '';
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
  }, [HOUR_HEIGHT, isMobile, dayList, onEventMove]);

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
    resizeRef.current = { eventId: event.id, startY: e.clientY, deltaY: 0, moved: false, eventStart: event.start, eventEnd: event.end, minDelta, maxDelta };
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
      setResizePos({ eventId: resizeRef.current.eventId, deltaY: snappedDelta });
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
        setResizePos(null);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onEventResize, HOUR_HEIGHT, isMobile]);

  const makeCellTapHandler = useCallback(
    (day: Date, kind: 'real' | 'plan') =>
      (e: React.MouseEvent) => {
        // Ignore the click the browser fires right after a drag/resize ended
        // over empty space — it is the tail of the move gesture, not a tap.
        if (Date.now() - lastDragEndRef.current < 500) return;
        const rect = e.currentTarget.getBoundingClientRect();
        // Visual px → layout px (body zoom) before converting to minutes.
        const minutes = snapToGrid(Math.round(((e.clientY - rect.top) / bodyZoom()) * MINUTES_PER_PIXEL));
        const clamped = Math.max(0, Math.min(minutes, TOTAL_HOURS * 60 - SNAP));
        const start = new Date(day);
        start.setHours(START_HOUR + Math.floor(clamped / 60), clamped % 60, 0, 0);
        onBackgroundClick?.(start, kind);
      },
    [MINUTES_PER_PIXEL, onBackgroundClick]
  );

  const gridPx = TOTAL_HOURS * HOUR_HEIGHT;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} onTouchCancel={swipe.onTouchCancel}>
      {/* Page chrome stays fixed; only this area scrolls (short screens,
          horizontal overflow). Sticky day headers keep working inside it. */}
      <div className="flex-1 min-h-0 overflow-auto">
      <div className="min-w-[448px] max-lg:min-w-0 flex flex-col">
        {/* Header row: corner cell + clickable day headers. Single compact
            line ("MON 14") — the old stacked layout with the static
            Real/Plan filler cost ~70px of vertical space. */}
        <div className="flex sticky top-0 z-10 bg-background">
            <div className="w-12 flex-shrink-0 border-b border-outline-variant" />
            <div className="flex flex-1 min-w-0">
              {dayList.map((day) => {
                const today = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => onDateSelect?.(day)}
                    title="Open day view"
                    className={`flex-1 min-w-[112px] max-lg:min-w-0 max-w-full px-2 py-1.5 flex items-baseline justify-center gap-1.5 border-b border-outline-variant transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${today ? 'bg-surface-container-low' : ''}`}
                  >
                    <span className={`font-label-sm text-label-sm uppercase tracking-[0.14em] ${today ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                      {formatWeekdayShort(day)}
                    </span>
                    <span className={`font-label-md ${today ? 'text-primary' : 'text-on-surface'}`}>
                      {formatDayOfMonth(day)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Grid row: time gutter + day columns. The gutter shares the row
              top with the grids (no magic spacer), so hour labels can never
              drift off the grid lines. */}
          <div ref={gridAnchorRef} className="flex">
            <div className="w-12 flex-shrink-0 relative" style={{ height: `${gridPx}px`, minHeight: '100%' }}>
              {/* The first label (START_HOUR) is skipped: centered on the very
                  top edge it gets half-clipped and looks broken. The grid line
                  itself stays. */}
              {hourTicks.filter((hour) => hour !== START_HOUR).map((hour) => (
                <span
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 max-lg:!text-[7px] max-lg:leading-none font-label-sm text-label-sm text-on-surface-variant tabular-nums"
                  style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                >
                  {String(hour).padStart(2, '0')}
                </span>
              ))}
            </div>
            <div className="flex flex-1 min-w-0">
              {dayList.map((day, idx) => {
                const dayEvents = getEventsForDate(events, day).sort(
                  (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
                );
                const realEvents = dayEvents.filter((e) => (e.kind ?? 'real') !== 'plan');
                const planEvents = dayEvents.filter((e) => e.kind === 'plan');
                const visibleReal = single ? (singleKind === 'real' ? realEvents : []) : realEvents;
                const visiblePlan = single ? (singleKind === 'plan' ? planEvents : []) : planEvents;
                const isDropTarget = dragPos != null && dragPos.targetDayIdx === idx;

                const renderColumn = (list: typeof realEvents) => {
                  const lanes = layoutOverlapLanes(list);
                  return list.map((ev) => {
                    const top = timeToPixels(ev.start, START_HOUR, HOUR_HEIGHT);
                    const endPx = timeToPixels(ev.end, START_HOUR, HOUR_HEIGHT);
                    let height = Math.max(endPx - top, 13);
                    const subject = subjectMap[ev.subjectId];
                    const displayName = subject?.name || ev.title || 'Untitled';
                    const plan = ev.kind === 'plan';
                    // Solid fill for plans (custom color for subject-less
                    // events, else the subject color) — foreground picked
                    // for contrast; real events use the muted subject color.
                    const fill = eventFillColor(ev, subject);
                    const subjectColor = subject?.color || 'var(--color-on-surface-variant)';
                    const mutedFill = `color-mix(in srgb, ${subjectColor} 42%, var(--color-surface-dim))`;
                    const spineColor = plan ? 'rgb(255 255 255 / 0.28)' : subjectColor;
                    const planFg = plan ? { color: isDarkTheme() ? pageBackground() : contrastOn(fill) } : undefined;
                    let visualTop = top;
                    let visualDx = 0;
                    let dragging = false;
                    if (dragPos?.eventId === ev.id) {
                      visualTop += dragPos.deltaY;
                      visualDx = dragPos.deltaX;
                      dragging = true;
                    }
                    if (resizePos?.eventId === ev.id) height = Math.max(height + resizePos.deltaY, 13);
                    // Leave a couple of pixels before the event's nominal end
                    // so back-to-back events do not visually merge.
                    const visualHeight = Math.max(height - 2, 2);
                    // The grid compresses on short screens, so the layout comes
                    // from absolute pixels — see utils/eventDensity. Top-aligned
                    // whenever there is room, centred only when there is not.
                    const layout = eventLayout(visualHeight, isMobile);
                    // Resizing works at any length; only the grab strip adapts
                    // to how much room the block has.
                    const zone = eventResizeZone(visualHeight, isMobile);
                    const resizable = canResizeEvent(visualHeight, isMobile);
                    const shellRadius = `${Math.max(2, Math.min(isMobile ? 5 : 7, visualHeight / 6))}px`;
                    const lane = lanes[ev.id];
                    return (
                      <div
                        key={ev.id}
                        data-event-id={ev.id}
                        className={`absolute overflow-hidden cursor-pointer hover:brightness-125 transition-[filter] group ring-1 ring-inset ring-black/30 outline outline-1 outline-white/20 max-lg:[touch-action:none] max-lg:select-none ${lane ? 'w-auto' : 'left-0 right-[6px]'}`}
                        style={{
                          top: `${visualTop}px`,
                          height: `${visualHeight}px`,
                          borderRadius: shellRadius,
                          backgroundColor: plan ? fill : mutedFill,
                          transform: dragging && visualDx ? `translateX(${visualDx}px)` : undefined,
                          left: lane ? `${lane.left}%` : undefined,
                          width: lane ? `calc(${lane.width}% - 6px)` : undefined,
                          zIndex: dragging ? 20 : lane?.z,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(ev);
                        }}
                        onMouseDown={(e) => handleDragStart(ev, idx, e)}
                        onTouchStart={(e) => handleTouchDragStart(ev, idx, e)}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-[3px]"
                          style={{
                            backgroundColor: spineColor,
                            borderTopLeftRadius: shellRadius,
                            borderBottomLeftRadius: shellRadius,
                          }}
                        />
                        <div
                          className="flex flex-col items-start h-full pl-2.5 pr-1 min-w-0"
                          style={{
                            paddingTop: `${layout.padTop}px`,
                            justifyContent: layout.align === 'center' ? 'center' : 'flex-start',
                          }}
                        >
                          <span
                            className="font-['Inter'] text-[12px] leading-[16px] max-lg:!text-[7px] max-lg:leading-none font-semibold tracking-tight text-on-surface truncate"
                            style={planFg}
                          >
                            {displayName}
                          </span>
                          {layout.showTime && (
                            <span
                              className="font-body-sm text-body-sm max-lg:!text-[6px] max-lg:leading-none text-on-surface-variant block truncate"
                              style={planFg}
                            >
                              {timeFromDate(ev.start)} - {timeFromDate(ev.end)}
                            </span>
                          )}
                        </div>
                        {resizable && (
                          <div
                            className="absolute left-0 right-0 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ bottom: 0, height: `${zone.height}px`, marginBottom: `${zone.offset}px` }}
                            onMouseDown={(e) => handleResizeStart(ev, e)}
                          >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 bg-outline-variant rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  });
                };

                return (
                  <div
                    key={day.toISOString()}
                    ref={(el) => {
                      dayGridRefs.current[idx] = el;
                    }}
                    className={`flex-1 min-w-[112px] max-lg:min-w-0 max-w-full relative border-l border-outline-variant ${isDropTarget ? 'bg-primary/10' : ''}`}
                    style={{ height: `${gridPx}px`, minHeight: '100%' }}
                  >
                    {hourTicks.map((hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 border-t border-outline-variant/40"
                        style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                      />
                    ))}
                    {/* Single-kind mode: one full-width column, no split. The live
                        session block is real — hidden in plan-only mode. */}
                    {single ? (
                      <div className={`absolute left-0 right-0 top-0 bottom-0 ${dragPos ? 'overflow-visible' : 'overflow-hidden'}`} onClick={makeCellTapHandler(day, singleKind)}>
                        {renderColumn(singleKind === 'real' ? visibleReal : visiblePlan)}
                        {isSameDay(day, new Date()) && activeSession && singleKind === 'real' && (
                          <LiveEventBlock
                            start={activeSession.start}
                            startHour={START_HOUR}
                            endHour={END_HOUR}
                            hourHeight={HOUR_HEIGHT}
                            subject={subjectMap[activeSession.subjectId]}
                            isMobile={isMobile}
                            pausedAt={activeSession.pausedAt}
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Left column: real events */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1/2 ${dragPos ? 'overflow-visible' : 'overflow-hidden'}`} onClick={makeCellTapHandler(day, 'real')}>
                          {renderColumn(visibleReal)}
                          {isSameDay(day, new Date()) && activeSession && (
                            <LiveEventBlock
                              start={activeSession.start}
                              startHour={START_HOUR}
                              endHour={END_HOUR}
                              hourHeight={HOUR_HEIGHT}
                              subject={subjectMap[activeSession.subjectId]}
                              isMobile={isMobile}
                              pausedAt={activeSession.pausedAt}
                            />
                          )}
                        </div>
                        {/* 2px hairline centered on the middle: a 1px line at
                            left-1/2 lands on a fractional pixel whenever the
                            column width is odd and anti-aliases into invisibility;
                            2px always covers at least one full pixel. */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-outline-variant/60" />
                        {/* Right column: plan events */}
                        <div className={`absolute right-0 top-0 bottom-0 w-1/2 ${dragPos ? 'overflow-visible' : 'overflow-hidden'}`} onClick={makeCellTapHandler(day, 'plan')}>
                          {renderColumn(visiblePlan)}
                        </div>
                      </>
                    )}
                    {/* Current-time line — last in DOM so it paints above the
                        event blocks for today's column. */}
                    {isSameDay(day, new Date()) && (
                      <CurrentTimeIndicator
                        startHour={START_HOUR}
                        endHour={END_HOUR}
                        hourHeight={HOUR_HEIGHT}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
