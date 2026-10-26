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

/**
 * Phone page turning on the browser's own horizontal scrolling: the previous,
 * current and next periods sit side by side in a snapping scroller. The drag,
 * fling and snap all run natively (on iOS, on the compositor at the screen's
 * refresh rate), which a JS-driven transform could never match.
 *
 * Once the scroll rests on a side page, the period changes and the scroller
 * jumps back to the middle in the same frame. The middle page now shows what
 * the side page showed, so the swap can't be seen. It waits for the finger to
 * lift: moving the scroll position under a finger breaks iOS's gesture.
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
      if (touchingRef.current) return;
      const side = atSide();
      if (!side) return;
      flushSync(side === 'prev' ? turnRef.current.onPrev : turnRef.current.onNext);
      centre();
    };
    const onScroll = () => {
      clearTimer();
      // The snap ends exactly on a page: turn at once, so a quick next flick
      // already starts from the middle.
      if (!touchingRef.current && atSide()) settle();
      else timerRef.current = window.setTimeout(settle, SETTLE_MS);
    };
    const onTouchStart = () => {
      touchingRef.current = true;
      clearTimer();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length) return;
      touchingRef.current = false;
      // Let go exactly on a page: no more scroll events will come.
      timerRef.current = window.setTimeout(settle, SETTLE_MS);
    };
    const resize = new ResizeObserver(() => {
      if (!touchingRef.current) centre();
    });
    resize.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', settle);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      clearTimer();
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
