import { useEffect, useRef, useState } from 'react';

interface CurrentTimeIndicatorProps {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  /** Scroll the grid to "now" on mount. Off for peek copies and for a day
   *  just turned to, which must open where the previous one was. */
  scrollIntoView?: boolean;
}

export function CurrentTimeIndicator({ startHour = 8, endHour = 24, hourHeight = 96, scrollIntoView = true }: CurrentTimeIndicatorProps) {
  const [now, setNow] = useState(new Date());
  const lineRef = useRef<HTMLDivElement>(null);
  const userNavigatedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60;
  const top = ((totalMinutes - startMinutes) / 60) * hourHeight;

  const visible = totalMinutes >= startMinutes && totalMinutes <= endHour * 60;

  // Layout can settle after mount (fonts, browser chrome, viewport insets).
  // Follow those changes until the user starts navigating the timeline.
  // Only scroll the vertical pane: scrollIntoView also moves hidden ancestors
  // and the horizontal day pager, which can trigger an unintended day turn.
  useEffect(() => {
    const line = lineRef.current;
    if (!scrollIntoView || !visible || !line || userNavigatedRef.current) return;
    let pane = line.parentElement;
    while (pane && !/^(auto|scroll)$/.test(getComputedStyle(pane).overflowY)) {
      pane = pane.parentElement;
    }
    if (!pane) return;
    const scroller = pane;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (userNavigatedRef.current || !scroller.clientHeight) return;
        const bounds = scroller.getBoundingClientRect();
        const lineBounds = line.getBoundingClientRect();
        // Rects include the interface's CSS zoom; scrollTop uses layout px.
        const zoom = bounds.height / scroller.offsetHeight;
        if (!zoom) return;
        scroller.scrollTop += (lineBounds.top + lineBounds.height / 2 - bounds.top) / zoom
          - scroller.clientTop - scroller.clientHeight / 2;
      });
    };
    const resize = new ResizeObserver(schedule);
    for (let el: HTMLElement | null = line.parentElement; el; el = el.parentElement) {
      resize.observe(el);
      if (el === scroller) break;
    }
    const stopFollowing = () => {
      userNavigatedRef.current = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const type of inputs) scroller.addEventListener(type, stopFollowing, { passive: true, capture: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      for (const type of inputs) scroller.removeEventListener(type, stopFollowing, true);
    };
  }, [hourHeight, startHour, endHour, scrollIntoView, visible]);

  if (!visible) return null;

  return (
    <div ref={lineRef} className="absolute left-0 right-0 flex items-center -ml-[5px] pointer-events-none z-[15]"
      style={{ top: `${top}px` }}>
      <div className="w-[7px] h-[7px] rounded-full bg-now flex-shrink-0" />
      {/* A 1px background can disappear at fractional grid positions / UI
          zoom. Borders are pixel-snapped, and 2px keeps the rule visible. */}
      <div className="current-time-line flex-1 min-w-0 border-t-2 border-now opacity-80" />
    </div>
  );
}
