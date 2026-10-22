import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SwipeAction {
  label: string;
  icon: string;
  onClick: () => void;
  /** 'pri' (accent), 'sec' (neutral) or 'err' (destructive) colours. */
  tone: 'pri' | 'sec' | 'err';
}

const TONES = {
  pri: { background: 'var(--color-primary)', color: 'var(--color-on-primary)' },
  sec: { background: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' },
  err: { background: 'var(--color-error-container)', color: 'var(--color-on-error-container)' },
};

const ACTION_W = 66;
const DECIDE_PX = 8;

interface SwipeRowProps {
  children: ReactNode;
  /** Revealed by a swipe to the right; letting go past the threshold runs it. */
  start?: SwipeAction;
  /** Revealed by a swipe to the left; the row stays open on them. */
  end?: SwipeAction[];
  /** Controlled: whether the end actions are showing. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Just added to the list: animate in (read at mount only). */
  enter?: boolean;
}

/**
 * A list row with swipe actions (phone). A horizontal drag moves the row and
 * uncovers the actions underneath; a vertical one is left to the scroll. The
 * row's touches never reach the page's day swipe behind it.
 *
 * The drag is written straight to the DOM — it changes on every touchmove.
 */
export function SwipeRow({ children, start, end = [], open, onOpenChange, enter = false }: SwipeRowProps) {
  const [enterClass] = useState(enter ? 'm-row-in' : '');
  const rowRef = useRef<HTMLDivElement>(null);
  const g = useRef<{ x: number; y: number; dx: number; mode: 'none' | 'h' | 'v'; base: number } | null>(null);
  const endW = end.length * ACTION_W;
  const startW = start ? 96 : 0;
  // A completed swipe is followed by a synthesized click on the row.
  const swipedAt = useRef(0);

  const place = (x: number, animate: boolean) => {
    const el = rowRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 180ms ease-out, background-color 0.2s ease-out' : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    g.current = { x: t.clientX, y: t.clientY, dx: 0, mode: 'none', base: open ? -endW : 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const s = g.current;
    if (!s) return;
    const t = e.touches[0];
    // Screen px → layout px: the phone UI is zoomed.
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const dx = (t.clientX - s.x) / zoom;
    const dy = (t.clientY - s.y) / zoom;
    if (s.mode === 'none') {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      s.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (s.mode !== 'h') return;
    // Past the actions the row strains instead of following 1:1.
    const raw = s.base + dx;
    const min = -(endW || 0);
    const max = startW;
    const x = raw < min ? min + (raw - min) * 0.3 : raw > max ? max + (raw - max) * 0.3 : raw;
    s.dx = x;
    place(x, false);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const s = g.current;
    g.current = null;
    if (!s || s.mode !== 'h') return;
    swipedAt.current = Date.now();
    if (start && s.dx > startW * 0.7) {
      place(0, true);
      onOpenChange(false);
      start.onClick();
      return;
    }
    const shouldOpen = endW > 0 && s.dx < -endW / 2;
    place(shouldOpen ? -endW : 0, true);
    if (shouldOpen !== open) onOpenChange(shouldOpen);
  };

  // Follow the controlled state (another row opened, an action ran).
  useEffect(() => {
    const el = rowRef.current;
    if (!el || g.current) return;
    el.style.transition = 'transform 180ms ease-out, background-color 0.2s ease-out';
    el.style.transform = open ? `translateX(${-endW}px)` : '';
  }, [open, endW]);

  return (
    <div className={`relative overflow-hidden border-b border-outline-variant ${enterClass}`}>
      {start && (
        <div aria-hidden="true" className="absolute inset-y-0 left-0 flex items-center m-lbl" style={{ ...TONES[start.tone], width: startW, gap: 6, paddingLeft: 16 }}>
          <span className="material-symbols-outlined m-ic s">{start.icon}</span>
          {start.label}
        </div>
      )}
      {end.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {end.map((a) => (
            <button
              key={a.label}
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onOpenChange(false);
                a.onClick();
              }}
              className="flex flex-col items-center justify-center m-lbl border-0"
              style={{ ...TONES[a.tone], width: ACTION_W, gap: 2 }}
            >
              <span className="material-symbols-outlined m-ic s">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={rowRef}
        className="m-press relative bg-background [touch-action:pan-y]"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          // Tail of a swipe, or a tap on an open row: close, don't act.
          if (Date.now() - swipedAt.current < 400 || open) {
            e.stopPropagation();
            e.preventDefault();
            if (open) onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
