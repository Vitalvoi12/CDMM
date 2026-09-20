import { useEffect, useRef, useState } from 'react';

interface CurrentTimeIndicatorProps {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
}

export function CurrentTimeIndicator({ startHour = 8, endHour = 24, hourHeight = 96 }: CurrentTimeIndicatorProps) {
  const [now, setNow] = useState(new Date());
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Scroll the day grid so "now" is in view when the timeline first opens
  // (e.g. after returning from the Study page with a running session).
  // Re-runs when hourHeight changes (grid resized after mount) so the line
  // stays centered — never on user scroll (no scroll listener here).
  useEffect(() => {
    lineRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourHeight]);

  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60;
  const top = ((totalMinutes - startMinutes) / 60) * hourHeight;

  const visible = totalMinutes >= startMinutes && totalMinutes <= endHour * 60;

  if (!visible) return null;

  return (
    <div ref={lineRef} className="absolute left-0 right-0 flex items-center -ml-[5px] pointer-events-none z-[5] max-lg:z-0"
      style={{ top: `${top}px` }}>
      <div className="w-[7px] h-[7px] rounded-full bg-now flex-shrink-0" />
      <div className="h-px bg-now w-full opacity-80" />
    </div>
  );
}
