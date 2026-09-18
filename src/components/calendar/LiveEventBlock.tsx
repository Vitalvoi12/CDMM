import { useEffect, useState } from 'react';
import type { Subject } from '../../types';

interface LiveEventBlockProps {
  /** ISO start of the running session. */
  start: string;
  /** Grid origin hour — the live block is clipped to the visible day. */
  startHour: number;
  endHour: number;
  hourHeight: number;
  subject?: Subject;
}

/**
 * Transient, growing block for the running study session in the Real column.
 * Starts at the session start, bottom edge pinned to "now" (square, as if the
 * event box is cut off by the current-time line). Not persisted anywhere and
 * not interactive — stopping the session creates the real saved event.
 */
export function LiveEventBlock({ start, startHour, endHour, hourHeight, subject }: LiveEventBlockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return null;

  const nowDate = new Date(now);
  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;

  const nowMins = minutesOfDay(nowDate);
  if (nowMins <= dayStartMinutes || nowMins > dayEndMinutes) return null;

  // Overnight / multi-day session: fill from the top of the visible grid.
  const sameDay = new Date(startMs).toDateString() === nowDate.toDateString();
  const sessionStartMins = sameDay ? minutesOfDay(new Date(startMs)) : dayStartMinutes - 1;

  const clampedStart = Math.max(sessionStartMins, dayStartMinutes);
  const clampedNow = Math.min(nowMins, dayEndMinutes);

  const top = ((clampedStart - dayStartMinutes) / 60) * hourHeight;
  const bottom = ((clampedNow - dayStartMinutes) / 60) * hourHeight;
  const height = bottom - top;
  if (height <= 1) return null;

  const colorBar = subject?.color || 'var(--color-on-surface-variant)';

  return (
    <div
      className="absolute right-[2px] w-[calc(100%-1rem)] lg:w-[calc(100%-2rem)] ml-auto overflow-hidden pointer-events-none border border-outline-variant"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        borderRadius: '8px 8px 0 0',
        backgroundColor: subject?.color ? `${subject.color}15` : undefined,
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[6px] max-lg:w-[5px]"
        style={{ backgroundColor: colorBar }}
      />
      <div className="flex items-start justify-between h-full pl-3 pt-1 pr-3 gap-2 min-w-0">
        <span
          className="font-label-sm text-label-sm max-lg:!text-[10px] max-lg:leading-none truncate font-semibold min-w-0"
          style={{ color: subject?.color || 'var(--color-on-surface)' }}
        >
          {subject?.name || 'Studying'}
        </span>
        <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0">
          {formatClock(startMs)} – now
        </span>
      </div>
    </div>
  );
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
