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
  // Runs only on mount — never hijacks the user's scroll position after that.
  useEffect(() => {
    lineRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, []);

  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60;
  const top = ((totalMinutes - startMinutes) / 60) * hourHeight;

  const visible = totalMinutes >= startMinutes && totalMinutes <= endHour * 60;

  if (!visible) return null;

  return (
    <div ref={lineRef} className="absolute left-0 right-0 flex items-center -ml-[5px] pointer-events-none"
      style={{ top: `${top}px`, zIndex: 10 }}>
      <div className="w-[10px] h-[10px] rounded-full bg-primary border-2 border-surface-container-lowest" />
      <div className="h-px bg-primary w-full opacity-50" />
    </div>
  );
}
