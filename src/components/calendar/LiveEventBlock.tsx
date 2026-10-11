import { useEffect, useState } from 'react';
import type { Subject } from '../../types';
import { eventLayout } from '../../utils/eventDensity';

interface LiveEventBlockProps {
  /** ISO start of the running session. */
  start: string;
  /** Grid origin hour — the live block is clipped to the visible day. */
  startHour: number;
  endHour: number;
  hourHeight: number;
  subject?: Subject;
  isMobile?: boolean;
}

/**
 * Transient, growing block for the running study session in the Real column.
 * Starts at the session start, bottom edge pinned to "now" (square, as if the
 * event box is cut off by the current-time line). Not persisted anywhere and
 * not interactive — stopping the session creates the real saved event.
 *
 * Driven entirely by the synced session record, so a session started on one
 * device renders here on all of them.
 */
export function LiveEventBlock({ start, startHour, endHour, hourHeight, subject, isMobile = false }: LiveEventBlockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return null;

  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;

  const endDate = new Date(now);
  const endMins = minutesOfDay(endDate);

  if (endMins <= dayStartMinutes || endMins > dayEndMinutes) return null;

  // Overnight / multi-day session: fill from the top of the visible grid.
  const sameDay = new Date(startMs).toDateString() === endDate.toDateString();
  const sessionStartMins = sameDay ? minutesOfDay(new Date(startMs)) : dayStartMinutes - 1;

  const clampedStart = Math.max(sessionStartMins, dayStartMinutes);
  const clampedEnd = Math.min(endMins, dayEndMinutes);

  const top = ((clampedStart - dayStartMinutes) / 60) * hourHeight;
  const bottom = ((clampedEnd - dayStartMinutes) / 60) * hourHeight;
  const height = bottom - top;
  if (height <= 1) return null;

  const colorBar = subject?.color || 'var(--color-on-surface-variant)';
  const shellRadius = `${Math.max(2, Math.min(isMobile ? 5 : 7, height / 6))}px`;
  // Laid out exactly like a saved event so the running block does not jump to
  // a different position the moment it is turned into a real event.
  const layout = eventLayout(height, isMobile);

  return (
    <div
      className="absolute left-0 right-[6px] overflow-hidden pointer-events-none"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        borderTopLeftRadius: shellRadius,
        borderTopRightRadius: shellRadius,
        backgroundColor: `color-mix(in srgb, ${colorBar} 42%, var(--color-surface-dim))`,
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: colorBar, borderTopLeftRadius: shellRadius }}
      />
      <div
        className="flex flex-col items-start h-full pl-3 pr-2 min-w-0"
        style={{
          paddingTop: `${layout.padTop}px`,
          justifyContent: layout.align === 'center' ? 'center' : 'flex-start',
        }}
      >
        <span className="font-['Inter'] text-[12px] leading-[16px] max-lg:!text-[12px] max-lg:!leading-[15px] truncate font-semibold tracking-tight min-w-0 max-w-full text-on-surface">
          {subject?.name || 'Studying'}
        </span>
        {layout.showTime && (
          <span className="font-body-sm text-body-sm max-lg:!text-[11px] max-lg:!leading-[14px] text-on-surface-variant tabular-nums truncate max-w-full mt-0.5">
            {formatClock(startMs)} – now
          </span>
        )}
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
