import { useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { eventRepo } from '../../services/repositories';
import { splitStudySlices } from '../../utils/analytics';
import { liveEventForDate } from '../../utils/stats';
import { addDays, dateKey, formatDuration, timeFromDate } from '../../utils/time';

/** 0:32:41 — the phone's timer drops the leading zero of the hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface DockProps {
  active: boolean;
  name: string;
  color?: string;
  startTime: string | null;
  elapsed: number;
  onStart: () => void;
  onFinish: () => void;
  onExpand: () => void;
}

/**
 * The phone's session bar, pinned above the bottom nav on every page. Idle it
 * offers Start; running it shows the subject, the timer and Finish, and a tap
 * anywhere else on it opens the session sheet.
 */
export function SessionDock({ active, name, color, startTime, elapsed, onStart, onFinish, onExpand }: DockProps) {
  if (!active) {
    return (
      <div className="m-dock lg:hidden">
        <span className="m-dot" style={{ background: 'var(--color-outline)' }} />
        <span className="flex-1 min-w-0 font-semibold m-tr">No active session</span>
        <button type="button" className="m-btn pri" onClick={onStart}>
          Start
        </button>
      </div>
    );
  }
  return (
    <div className="m-dock lg:hidden">
      <button
        type="button"
        onClick={onExpand}
        aria-label={`${name} session, ${formatClock(elapsed)}. Open the session`}
        className="flex-1 min-w-0 self-stretch flex items-center bg-transparent border-0 p-0 text-left text-inherit"
        style={{ gap: 10 }}
      >
        <span className="relative flex m-dot" style={{ background: color || 'currentColor' }}>
          <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ background: color || 'currentColor' }} />
        </span>
        <span className="flex flex-col flex-1 min-w-0">
          <span className="font-semibold m-tr">{name}</span>
          <span className="m-sm m-mut">Started {startTime ? timeFromDate(startTime) : '--:--'}</span>
        </span>
        <span className="m-h2 m-num">{formatClock(elapsed)}</span>
      </button>
      <button type="button" className="m-btn err" onClick={onFinish} aria-label="Finish session">
        Finish
      </button>
    </div>
  );
}

/** Today's focus minutes (running session included) and the day streak. */
function useTodayAndStreak(startTime: string | null, elapsed: number) {
  // Recomputed once a minute, not every tick of the timer.
  const minute = Math.floor(elapsed / 60000);
  return useMemo(() => {
    const now = startTime ? new Date(startTime).getTime() + minute * 60000 : Date.now();
    const events = eventRepo.getAll();
    const live = startTime ? liveEventForDate({ subjectId: '', start: startTime }, new Date(now), now) : null;
    const slices = splitStudySlices(live ? [...events, live] : events);
    const byDay = new Map<string, number>();
    for (const s of slices) byDay.set(s.date, (byDay.get(s.date) || 0) + s.minutes);
    const today = new Date(now);
    let cursor = byDay.get(dateKey(today)) ? today : addDays(today, -1);
    let streak = 0;
    while (byDay.get(dateKey(cursor))) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return { todayMinutes: byDay.get(dateKey(today)) || 0, streak };
  }, [startTime, minute]);
}

interface SheetProps {
  name: string;
  color?: string;
  startTime: string | null;
  elapsed: number;
  onEditStart: () => void;
  onFinish: () => void;
  onClose: () => void;
}

/** The expanded session: big timer, start fix, today / streak, slide to finish. */
export function SessionSheet({ name, color, startTime, elapsed, onEditStart, onFinish, onClose }: SheetProps) {
  const { todayMinutes, streak } = useTodayAndStreak(startTime, elapsed);
  return (
    <Sheet label="Live session" onClose={onClose} className="!gap-[18px]">
      <div className="m-shd">
        <span className="flex items-center min-w-0" style={{ gap: 10 }}>
          <span className="m-dot" style={{ background: color || 'currentColor' }} />
          <span className="m-h2 m-tr">{name}</span>
        </span>
        <button type="button" className="m-ib" aria-label="Collapse" onClick={onClose}>
          <span className="material-symbols-outlined m-ic">expand_more</span>
        </button>
      </div>

      <div className="flex flex-col items-center" style={{ gap: 4 }}>
        <span className="m-lbl m-mut">Time on task</span>
        <span className="m-num" style={{ font: '700 64px/72px var(--font-display-lg)', letterSpacing: '-.02em' }}>
          {formatClock(elapsed)}
        </span>
        <button type="button" className="m-chip" style={{ border: 0, background: 'none', color: 'var(--color-on-surface-variant)' }} onClick={onEditStart}>
          Started {startTime ? timeFromDate(startTime) : '--:--'}
          <span className="material-symbols-outlined m-ic s">edit</span>
        </button>
      </div>

      <div className="grid grid-cols-2" style={{ gap: 12 }}>
        <div className="m-tile">
          <span className="m-lbl m-mut">Today</span>
          <b className="m-num">{formatDuration(todayMinutes)}</b>
        </div>
        <div className="m-tile">
          <span className="m-lbl m-mut">Streak</span>
          <b className="m-num">{streak} {streak === 1 ? 'day' : 'days'}</b>
        </div>
      </div>

      <SlideToFinish onDone={onFinish} />
    </Sheet>
  );
}

/**
 * Drag the knob to the end to finish. Let go early and it slides back.
 * Keyboard: Right / End move it, reaching the end finishes too.
 */
function SlideToFinish({ onDone }: { onDone: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; span: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const finishIfDone = (p: number) => {
    if (p >= 0.92) {
      setProgress(1);
      onDone();
    } else {
      setProgress(0);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const track = trackRef.current?.getBoundingClientRect();
    const knob = knobRef.current?.getBoundingClientRect();
    if (!track || !knob) return;
    // Rects are on-screen px, like clientX; the 6px insets are layout px, so
    // they are scaled by the same factor (the zoom).
    const scale = track.width / (trackRef.current?.offsetWidth || track.width);
    drag.current = { x: e.clientX, span: track.width - knob.width - 12 * scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setProgress(Math.min(1, Math.max(0, (e.clientX - d.x) / d.span)));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    finishIfDone(progress);
  };

  const pct = Math.round(progress * 100);
  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Slide to finish the session"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'End') {
          e.preventDefault();
          const next = e.key === 'End' ? 1 : Math.min(1, progress + 0.25);
          if (next >= 1) finishIfDone(1);
          else setProgress(next);
        } else if (e.key === 'ArrowLeft' || e.key === 'Home') {
          e.preventDefault();
          setProgress(0);
        }
      }}
      className="relative flex items-center justify-center overflow-hidden select-none"
      style={{ height: 60, borderRadius: 12, background: 'var(--color-error-container)', color: 'var(--color-on-error-container)' }}
    >
      <span
        className="absolute left-0 top-0 bottom-0"
        style={{
          width: `calc(${progress} * (100% - 60px) + 54px)`,
          background: 'color-mix(in srgb, var(--color-error) 35%, var(--color-error-container))',
          transition: dragging ? 'none' : 'width 200ms ease-out',
        }}
      />
      <span
        ref={knobRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute flex items-center justify-center [touch-action:none] cursor-grab"
        style={{
          left: `calc(6px + ${progress} * (100% - 60px))`,
          top: 6,
          width: 48,
          height: 48,
          borderRadius: 9.6,
          background: 'var(--color-error)',
          color: 'var(--color-background)',
          transition: dragging ? 'none' : 'left 200ms ease-out',
        }}
      >
        <span className="material-symbols-outlined m-ic">arrow_forward</span>
      </span>
      <span className="m-lbm relative pointer-events-none" style={{ paddingLeft: 56, opacity: 1 - progress }}>
        Slide to finish
      </span>
    </div>
  );
}
