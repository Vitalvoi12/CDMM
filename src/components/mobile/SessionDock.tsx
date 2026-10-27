import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { eventRepo } from '../../services/repositories';
import { focusStreak } from '../../utils/analytics';
import { calculateDailyStats, liveEventForDate } from '../../utils/stats';
import { formatDuration, timeFromDate } from '../../utils/time';

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
  onFinish: () => void;
  onExpand: () => void;
}

/**
 * The phone's session bar, pinned above the bottom nav on the calendar while
 * a session runs (the SwipeDock below). With none running there is no bar:
 * the ▶ beside the calendar's floating switch starts one.
 */
export function SessionDock({ active, ...dock }: DockProps) {
  if (!active) return null;
  return <SwipeDock {...dock} />;
}

/** Share of the bar's width a swipe must pass before letting go finishes. */
const FINISH_AT = 0.4;

/** First-run hint: the bar slides itself this far left to show the finish strip… */
const HINT_PX = 50;
/** …for this long, on the first HINT_TIMES appearances, until a swipe has finished a session once. */
const HINT_MS = 1200;
const HINT_TIMES = 2;
const HINT_COUNT_KEY = 'cdmm.dock-hint-count';
const SWIPED_KEY = 'cdmm.dock-swiped';

/** Whether this appearance of the bar shows the hint; counts it if so. */
function takeHint(): boolean {
  try {
    if (localStorage.getItem(SWIPED_KEY)) return false;
    const n = Number(localStorage.getItem(HINT_COUNT_KEY)) || 0;
    if (n >= HINT_TIMES) return false;
    localStorage.setItem(HINT_COUNT_KEY, String(n + 1));
    return true;
  } catch {
    return false;
  }
}

function markSwiped(): void {
  try {
    localStorage.setItem(SWIPED_KEY, '1');
  } catch {
    // storage unavailable — the hint may show again
  }
}

/**
 * The running bar: a tap opens the session sheet, a swipe to the left
 * uncovers a red "Release to finish" strip, and letting go past FINISH_AT
 * finishes. Short of it the bar slides back. The sheet's slide is the
 * keyboard path to Finish. The first times it appears it nudges itself left
 * and says "Swipe left to finish" (just the words under reduced motion).
 */
function SwipeDock({ name, color, startTime, elapsed, onFinish, onExpand }: Omit<DockProps, 'active'>) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; scale: number; width: number; on: boolean } | null>(null);
  const moved = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(false);
  const hintMoved = useRef(false);

  useEffect(() => {
    if (!takeHint()) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let end = 0;
    const start = window.setTimeout(() => {
      setHint(true);
      if (!still) {
        hintMoved.current = true;
        setDx(-HINT_PX);
      }
      end = window.setTimeout(stopHint, HINT_MS);
    }, 600);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, []);

  /** Ends the hint (its time is up, or a finger landed): the bar slides back. */
  function stopHint() {
    setHint(false);
    if (hintMoved.current) {
      hintMoved.current = false;
      setDx(0);
    }
  }

  const past = (x: number) => !!drag.current && -x >= drag.current.width * FINISH_AT;

  const onPointerDown = (e: React.PointerEvent) => {
    const bar = barRef.current;
    if (!bar || e.button !== 0) return;
    if (hint) stopHint();
    const rect = bar.getBoundingClientRect();
    // clientX is in on-screen px, the translate in layout px (the body is zoomed).
    const scale = rect.width / (bar.offsetWidth || rect.width);
    drag.current = { x: e.clientX, y: e.clientY, scale, width: bar.offsetWidth, on: false };
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = (e.clientX - d.x) / d.scale;
    const my = (e.clientY - d.y) / d.scale;
    if (!d.on) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) {
        drag.current = null;
        return;
      }
      d.on = true;
      moved.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setDx(Math.max(-d.width, Math.min(0, mx)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    setDragging(false);
    if (-dx >= d.width * FINISH_AT) {
      // Slide the bar off, then finish; the idle bar takes its place.
      setDx(-d.width);
      markSwiped();
      window.setTimeout(() => {
        onFinish();
        setDx(0);
      }, 160);
    } else {
      setDx(0);
    }
  };

  const ready = dragging ? past(dx) : dx < 0 && !hint;
  return (
    <div
      ref={barRef}
      className="m-dock lg:hidden relative overflow-hidden"
      style={{ padding: 0, border: 0, boxShadow: 'none', background: dx < 0 ? 'var(--color-error)' : 'transparent' }}
    >
      {dx < 0 && (
        <span
          className="absolute inset-0 flex items-center justify-end"
          style={{ gap: 8, padding: '0 18px', color: 'var(--color-background)', opacity: ready ? 1 : 0.6 }}
          aria-hidden="true"
        >
          <span className="m-lbm">{ready ? 'Release to finish' : 'Swipe to finish'}</span>
          <span className="material-symbols-outlined m-ic">stop_circle</span>
        </span>
      )}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          // A swipe ends in a click too; only a tap opens the sheet.
          if (moved.current) moved.current = false;
          else onExpand();
        }}
        aria-label={`${name} session, ${formatClock(elapsed)}. Tap to open, swipe left to finish`}
        className="m-dock absolute inset-0 text-left [touch-action:pan-y] select-none"
        style={{
          margin: 0,
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : hint ? 'transform 360ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'transform 160ms ease-out',
          boxShadow: dx < 0 ? 'var(--shadow-elev-3)' : undefined,
        }}
      >
        <span className="relative flex m-dot" style={{ background: color || 'currentColor' }}>
          <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ background: color || 'currentColor' }} />
        </span>
        <span className="flex flex-col flex-1 min-w-0">
          <span className="font-semibold m-tr">{name}</span>
          {hint ? (
            <span className="m-sm" style={{ color: 'var(--color-on-surface)' }}>Swipe left to finish</span>
          ) : (
            <span className="m-sm m-mut">Started {startTime ? timeFromDate(startTime) : '--:--'}</span>
          )}
        </span>
        <span className="m-h2 m-num">{formatClock(elapsed)}</span>
        <span className="material-symbols-outlined m-ic s m-mut" style={{ margin: '0 8px 0 2px', opacity: 0.6 }} aria-hidden="true">
          keyboard_double_arrow_left
        </span>
      </button>
    </div>
  );
}

/** Today's focus minutes (running session included) and the day streak. */
function useTodayAndStreak(startTime: string | null, elapsed: number, countInStats: boolean) {
  // Recomputed once a minute, not every tick of the timer.
  const minute = Math.floor(elapsed / 60000);
  return useMemo(() => {
    const now = startTime ? new Date(startTime).getTime() + minute * 60000 : Date.now();
    const live = startTime ? liveEventForDate({ subjectId: '', start: startTime, countInStats }, new Date(now), now) : null;
    const events = live ? [...eventRepo.getAll(), live] : eventRepo.getAll();
    return {
      todayMinutes: calculateDailyStats(events, new Date(now)).totalMinutes,
      streak: focusStreak(events, new Date(now)),
    };
  }, [startTime, countInStats, minute]);
}

interface SheetProps {
  name: string;
  color?: string;
  startTime: string | null;
  elapsed: number;
  onEditStart: () => void;
  countInStats: boolean;
  onCountInStatsChange: (count: boolean) => void;
  onFinish: () => void;
  onClose: () => void;
}

/** The expanded session: big timer, start fix, today / streak, slide to finish. */
export function SessionSheet({ name, color, startTime, elapsed, onEditStart, countInStats, onCountInStatsChange, onFinish, onClose }: SheetProps) {
  const { todayMinutes, streak } = useTodayAndStreak(startTime, elapsed, countInStats);
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
        <StatsCheck checked={countInStats} onChange={onCountInStatsChange} />
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

/** Phone: whether the session counts toward statistics, as a small checkbox chip. */
export function StatsCheck({ checked, onChange }: { checked: boolean; onChange: (count: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className="m-chip"
      style={{ border: 0, background: 'none', color: 'var(--color-on-surface-variant)' }}
      onClick={() => onChange(!checked)}
    >
      <span className="material-symbols-outlined m-ic s">{checked ? 'check_box' : 'check_box_outline_blank'}</span>
      Count in stats
    </button>
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
        className="absolute"
        style={{
          // Same insets and corners as the knob, so the fill ends on it.
          left: 6,
          top: 6,
          bottom: 6,
          borderRadius: 9.6,
          width: `calc(${progress} * (100% - 60px) + 48px)`,
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
