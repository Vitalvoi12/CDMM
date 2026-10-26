import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

interface SwipePagerProps {
  /** The shown period. The pager returns to the middle page whenever it changes. */
  pageKey: string;
  prev: ReactNode;
  current: ReactNode;
  next: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

/** A pause this long in scroll events means the scroll has come to rest
 *  (fallback for browsers without `scrollend`). */
const SETTLE_MS = 120;
/** The finish after lift-off: quicker than iOS's own snap, which can't be tuned. */
const FINISH_MS = 220;
const MIN_FINISH_MS = 110;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
/** The ease's starting slope (y1 / x1), so a flick finishes at its own speed. */
const EASE_SLOPE = 0.61 / 0.22;
/** Scroll samples older than this don't count toward the flick speed. */
const VELOCITY_WINDOW_MS = 80;
/** How far ahead a flick is projected when picking the page it lands on. */
const PROJECT_MS = 200;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Phone page turning on the browser's own horizontal scrolling: the previous,
 * current and next periods sit side by side in a snapping scroller. The drag
 * follows the finger natively (on iOS, on the compositor at the screen's
 * refresh rate), which a JS-driven transform could never match.
 *
 * iOS's snap after lift-off is slow and can't be tuned, so at lift-off the
 * pager takes over: it stops the native scroll where it is and slides the
 * pages the rest of the way with a short transform animation (compositor
 * too), starting at the flick's speed. Without touch (or with reduced
 * motion) the native snap does the finish.
 *
 * Once the pages rest on a side page, the period changes and the scroller
 * jumps back to the middle in the same frame. The middle page now shows what
 * the side page showed, so the swap can't be seen. A touch during the finish
 * completes it at once, so quick flicks keep paging.
 *
 * Meant to sit inside a vertical scroller with all three pages the same
 * height, so the pages scroll vertically together and their hours line up.
 */
export function SwipePager({ pageKey, prev, current, next, onPrev, onNext, className = '' }: SwipePagerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const touchingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const turnRef = useRef({ onPrev, onNext });
  turnRef.current = { onPrev, onNext };

  const centre = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  // A new period (a turn, or the header's arrows / Today) starts in the middle.
  useLayoutEffect(centre, [pageKey, centre]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The scroller's recent positions while the finger drags, for the flick speed.
    let samples: { x: number; t: number }[] = [];
    // A finish in flight; a new touch completes it at once.
    let pending: { anims: Animation[]; commit: () => void } | null = null;

    const clearTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const atSide = () => {
      const max = el.scrollWidth - el.clientWidth;
      return el.scrollLeft <= 1 ? 'prev' : el.scrollLeft >= max - 1 ? 'next' : null;
    };
    const settle = () => {
      clearTimer();
      if (touchingRef.current || pending) return;
      const side = atSide();
      if (!side) return;
      flushSync(side === 'prev' ? turnRef.current.onPrev : turnRef.current.onNext);
      centre();
    };
    const velocity = () => {
      const now = performance.now();
      const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
      if (recent.length < 2) return 0;
      const a = recent[0];
      const b = recent[recent.length - 1];
      return b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    };

    /** Lift-off: stop the native scroll and slide to the page the flick
     *  points at, then turn (or stay) in the same frame the slide ends. */
    const finish = () => {
      const w = el.clientWidth;
      const mid = (el.scrollWidth - w) / 2;
      const v = velocity();
      const offset = el.scrollLeft - mid;
      if (Math.abs(offset) < 1 || !w) return false;
      // The page nearest to where the flick would carry the scroll.
      const page = Math.max(-1, Math.min(1, Math.round((offset + v * PROJECT_MS) / w)));
      // Freeze the native scroll (and its momentum) where it is.
      el.style.overflowX = 'hidden';
      el.style.scrollSnapType = 'none';
      const from = el.scrollLeft;
      const target = mid + page * w;
      const left = Math.abs(target - from);
      const speed = Math.sign(v) === Math.sign(target - from) ? Math.abs(v) : 0;
      const byDistance = Math.max(MIN_FINISH_MS, FINISH_MS * Math.min(1, left / w));
      const duration = speed > 0 ? Math.min(byDistance, Math.max(MIN_FINISH_MS, (EASE_SLOPE * left) / speed)) : byDistance;
      const panes = Array.from(el.children) as HTMLElement[];
      const anims = panes.map((p) =>
        p.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${from - target}px)` }], { duration, easing: EASE, fill: 'forwards' })
      );
      const commit = () => {
        if (pending?.commit !== commit) return;
        pending = null;
        // One task, one paint: scroll to where the slide ended, drop the
        // slide, then turn and re-centre.
        el.style.overflowX = '';
        el.style.scrollSnapType = '';
        el.scrollLeft = target;
        for (const a of anims) a.cancel();
        if (page) {
          flushSync(page < 0 ? turnRef.current.onPrev : turnRef.current.onNext);
          centre();
        }
      };
      pending = { anims, commit };
      anims[0].onfinish = commit;
      // Backup: iOS doesn't always deliver `finish`.
      window.setTimeout(commit, duration + 60);
      return true;
    };

    const onScroll = () => {
      if (pending) return;
      if (touchingRef.current) {
        const t = performance.now();
        samples.push({ x: el.scrollLeft, t });
        while (samples.length > 2 && t - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
      }
      clearTimer();
      // The snap ends exactly on a page: turn at once, so a quick next flick
      // already starts from the middle.
      if (!touchingRef.current && atSide()) settle();
      else timerRef.current = window.setTimeout(settle, SETTLE_MS);
    };
    const onTouchStart = () => {
      pending?.commit();
      touchingRef.current = true;
      samples = [{ x: el.scrollLeft, t: performance.now() }];
      clearTimer();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length) return;
      touchingRef.current = false;
      if (e.type === 'touchend' && !reducedMotion() && finish()) return;
      // Let go exactly on a page: no more scroll events will come.
      timerRef.current = window.setTimeout(settle, SETTLE_MS);
    };
    const resize = new ResizeObserver(() => {
      if (!touchingRef.current && !pending) centre();
    });
    resize.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', settle);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      clearTimer();
      if (pending) {
        for (const a of pending.anims) a.cancel();
        pending = null;
        el.style.overflowX = '';
        el.style.scrollSnapType = '';
      }
      resize.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', settle);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [centre]);

  const page = 'w-full shrink-0 snap-center [scroll-snap-stop:always]';
  return (
    <div ref={ref} className={`swipe-pager flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory ${className}`}>
      <div className={page} aria-hidden inert>{prev}</div>
      <div className={page}>{current}</div>
      <div className={page} aria-hidden inert>{next}</div>
    </div>
  );
}
