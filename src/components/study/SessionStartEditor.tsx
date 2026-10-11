import { useEffect, useRef, useState } from 'react';
import { formatTimerDuration } from '../../utils/time';
import { useEscapeOverlay } from '../../services/overlays';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Sheet } from '../mobile/Sheet';
import { formatClock } from '../mobile/SessionDock';

interface SessionStartEditorProps {
  /** Current wall-clock start of the live session, ISO. */
  startTime: string | null;
  /** Focus ms so far, used to preview the resulting timer. */
  elapsed: number;
  /** Apply a new start (ms epoch). Out-of-range values are clamped by the hook. */
  onApply: (startMs: number) => void;
  onCancel: () => void;
}

const QUICK_BACKDATE = [
  { label: '-15m', minutes: 15 },
  { label: '-30m', minutes: 30 },
  { label: '-1h', minutes: 60 },
];

/** `datetime-local` value in the browser's timezone — no trailing Z. */
function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Move the wall-clock start of a running session.
 *
 * The point is the forgotten start: the timer began tracking later than the
 * work actually did, so backdating the start grows the recorded focus time by
 * exactly that gap. The end of the block is derived from start + elapsed, so
 * only the beginning of the block moves — the moment the user pressed Finish
 * is preserved.
 */
export function SessionStartEditor(props: SessionStartEditorProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileSessionStartEditor {...props} /> : <DesktopSessionStartEditor {...props} />;
}

/**
 * Phone sheet: the quick backdates preview into the field and the timer
 * below it; Apply commits (on the desktop they apply straight away).
 */
function MobileSessionStartEditor({ startTime, elapsed, onApply, onCancel }: SessionStartEditorProps) {
  const [now] = useState(() => Date.now());
  const base = startTime ? new Date(startTime).getTime() : now;
  const [value, setValue] = useState(() => toLocalInputValue(base));
  const [quick, setQuick] = useState<number | null>(null);
  const parsed = new Date(value).getTime();
  const clamped = Number.isFinite(parsed) ? Math.min(parsed, now) : null;
  const preview = Math.max(0, elapsed - (clamped !== null ? clamped - base : 0));

  return (
    <Sheet label="Change session start" onClose={onCancel} z={110} className="!gap-4">
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          if (clamped !== null) onApply(clamped);
        }}
      >
        <div className="m-shd">
          <h2 className="m-h2">When did you start?</h2>
          <button type="button" className="m-ib" aria-label="Close" onClick={onCancel}>
            <span className="material-symbols-outlined m-ic">close</span>
          </button>
        </div>
        <p className="m-mut" style={{ margin: 0 }}>
          Started tracking late? Move the start back. The session keeps its length from that moment on.
        </p>
        <div className="m-fld">
          <label className="m-lbl m-mut" htmlFor="m-session-start">Started at</label>
          <input
            id="m-session-start"
            type="datetime-local"
            className="m-in"
            value={value}
            max={toLocalInputValue(now)}
            onChange={(e) => {
              setValue(e.target.value);
              setQuick(null);
            }}
          />
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {QUICK_BACKDATE.map((q) => (
            <button
              key={q.label}
              type="button"
              className={`m-chip flex-1 justify-center ${quick === q.minutes ? 'on' : ''}`}
              aria-pressed={quick === q.minutes}
              onClick={() => {
                setQuick(q.minutes);
                setValue(toLocalInputValue(Math.min(now, base - q.minutes * 60000)));
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="m-lbl m-mut">Time on task</span>
          <span className="m-h2 m-num" style={{ fontSize: 26, lineHeight: '32px' }}>{formatClock(preview)}</span>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button type="button" className="m-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="m-btn pri flex-1" disabled={clamped === null}>Apply</button>
        </div>
      </form>
    </Sheet>
  );
}

function DesktopSessionStartEditor({ startTime, elapsed, onApply, onCancel }: SessionStartEditorProps) {
  const dialogRef = useRef<HTMLFormElement>(null);
  // Frozen at open: the ceiling for the field and the baseline of the preview.
  // A live clock would drift under the user's cursor and re-run impure code on
  // every render.
  const [now] = useState(() => Date.now());
  const [value, setValue] = useState(() => toLocalInputValue(startTime ? new Date(startTime).getTime() : Date.now()));

  useEscapeOverlay(onCancel);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  // Up/Down nudge the start by ±5 min. Capture phase on window so the
  // calendar's own arrow shortcuts underneath never see the press; a focused
  // field keeps its native per-segment arrow editing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      e.preventDefault();
      e.stopPropagation();
      const step = (e.key === 'ArrowUp' ? 5 : -5) * 60000;
      setValue((v) => {
        const current = new Date(v).getTime();
        const base = Number.isFinite(current) ? current : startTime ? new Date(startTime).getTime() : now;
        return toLocalInputValue(Math.min(now, base + step));
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [now, startTime]);

  const parsed = new Date(value).getTime();
  // Future starts would make the running timer count backwards; clamp instead
  // of rejecting, so typing "now" in the field still works.
  const clamped = Number.isFinite(parsed) ? Math.min(parsed, now) : null;
  // Shift the same way the hook will: the origin moves, the end stays put, so
  // a negative shift (an earlier start) grows the recorded focus time.
  const shiftMs = clamped !== null && startTime ? clamped - new Date(startTime).getTime() : 0;
  const preview = Math.max(0, elapsed - shiftMs);

  const applyOffset = (minutes: number) => {
    onApply(Math.min(now, (startTime ? new Date(startTime).getTime() : now) - minutes * 60000));
  };

  return (
    <div className="overlay-root z-[110] flex items-center justify-center bg-scrim p-4 animate-fade-in" onClick={onCancel}>
      <form
        ref={dialogRef}
        tabIndex={-1}
        aria-label="Change session start"
        className="bg-surface-container-lowest rounded-2xl p-6 shadow-elev-3 w-full max-w-md max-h-full overflow-y-auto focus:outline-none animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        // Enter applies from anywhere in the dialog — focus starts on the form
        // itself, where Enter would not submit natively. A focused button keeps
        // its own Enter (Cancel, the quick backdates).
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.target instanceof HTMLButtonElement) return;
          e.preventDefault();
          e.stopPropagation();
          dialogRef.current?.requestSubmit();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (clamped !== null) onApply(clamped);
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Session start
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">close</span>
          </button>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">
          Started tracking late? Move the start back — the session keeps its length from that moment on.
        </p>

        <div className="flex flex-col gap-2 mb-3">
          <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
            Started at
          </label>
          <input
            type="datetime-local"
            value={value}
            max={toLocalInputValue(now)}
            onChange={(e) => setValue(e.target.value)}
            className="w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {QUICK_BACKDATE.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => applyOffset(q.minutes)}
              className="px-4 py-2 rounded-full border border-outline-variant font-label-sm text-label-sm text-on-surface hover:bg-surface-container transition-colors uppercase tracking-[0.12em]"
            >
              {q.label}
            </button>
          ))}
        </div>

        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] mb-6 flex items-baseline justify-between">
          <span>Time on task</span>
          <span className="font-display-lg text-display-lg max-lg:!text-[22px] text-on-surface tabular-nums tracking-tight">
            {formatTimerDuration(preview)}
          </span>
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={clamped === null}
            className="w-full py-2 bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}