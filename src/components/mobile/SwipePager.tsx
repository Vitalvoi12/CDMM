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
  /** Classes for each of the three pages (they fill the pager's box). */
  pageClassName?: string;
  /** 'x' (default): pages side by side; 'y': stacked, turned by a vertical
   *  swipe (month / year). A page's own vertical scroller hands a swipe
   *  past its end over to the pager. */
  axis?: 'x' | 'y';
}

/** A page's own vertical scroller (the page itself or the first inside it). */
const SCROLLER = '.overflow-y-auto';
const scrollerOf = (page: Element | undefined): HTMLElement | null =>
  !page ? null : page.matches(SCROLLER) ? (page as HTMLElement) : page.querySelector<HTMLElement>(SCROLLER);

/** A pause this long in scroll events means the scroll has come to rest
 *  (fallback for browsers without `scrollend`). */
const SETTLE_MS = 120;
/** Native scrolling owns both the drag and snap. Moving the pages with a
 * second transform animation while Android is still scrolling can make the
 * content jump or appear doubled. Re-centre only after the native snap ends.
 */
export function SwipePager({ pageKey, prev, current, next, onPrev, onNext, className = '', pageClassName = '', axis = 'x' }: SwipePagerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const touchingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const turnRef = useRef({ onPrev, onNext });
  turnRef.current = { onPrev, onNext };

  const centre = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (axis === 'x') el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    else el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    // Stacked pages meet at their ends: the page above shows its bottom.
    if (axis === 'y') {
      const above = scrollerOf(el.children[0]);
      if (above) above.scrollTop = above.scrollHeight;
      const below = scrollerOf(el.children[2]);
      if (below) below.scrollTop = 0;
    }
  }, [axis]);

  /** Turn to a side page. The middle page takes over the side page's own
   *  scroll position too, so nothing jumps when they swap. */
  const turn = useCallback((side: 'prev' | 'next') => {
    const el = ref.current;
    if (!el) return;
    const from = scrollerOf(el.children[side === 'prev' ? 0 : 2]);
    const top = from ? from.scrollTop : null;
    flushSync(side === 'prev' ? turnRef.current.onPrev : turnRef.current.onNext);
    centre();
    const to = scrollerOf(el.children[1]);
    if (to && top !== null) to.scrollTop = top;
  }, [centre]);

  // A new period (a turn, or the header's arrows / Today) starts in the middle.
  useLayoutEffect(centre, [pageKey, centre]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const x = axis === 'x';
    const pos = () => (x ? el.scrollLeft : el.scrollTop);
    const size = () => (x ? el.clientWidth : el.clientHeight);
    const maxPos = () => (x ? el.scrollWidth : el.scrollHeight) - size();
    const nativeScrollEnd = Reflect.has(el, 'onscrollend');

    const clearTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const settle = () => {
      clearTimer();
      const end = maxPos();
      if (touchingRef.current || end <= 2) return;
      if (pos() <= 1) turn('prev');
      else if (pos() >= end - 1) turn('next');
    };
    const scheduleFallback = () => {
      clearTimer();
      if (!touchingRef.current) timerRef.current = window.setTimeout(settle, SETTLE_MS);
    };
    const onTouchStart = () => {
      touchingRef.current = true;
      clearTimer();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length) return;
      touchingRef.current = false;
      if (!nativeScrollEnd) scheduleFallback();
    };
    const resize = new ResizeObserver(() => {
      if (!touchingRef.current) centre();
    });
    resize.observe(el);
    if (!nativeScrollEnd) el.addEventListener('scroll', scheduleFallback, { passive: true });
    el.addEventListener('scrollend', settle);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      clearTimer();
      resize.disconnect();
      el.removeEventListener('scroll', scheduleFallback);
      el.removeEventListener('scrollend', settle);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [axis, centre, turn]);

  const page = `${axis === 'x' ? 'w-full' : 'basis-full min-h-0'} shrink-0 snap-center [scroll-snap-stop:always] ${pageClassName}`;
  return (
    <div
      ref={ref}
      className={`swipe-pager flex ${axis === 'x' ? 'overflow-x-auto overflow-y-hidden snap-x' : 'swipe-pager-y flex-col overflow-y-auto overflow-x-hidden snap-y'} snap-mandatory ${className}`}
    >
      <div className={page} data-swipe-frame aria-hidden inert>{prev}</div>
      <div className={page} data-swipe-frame>{current}</div>
      <div className={page} data-swipe-frame aria-hidden inert>{next}</div>
    </div>
  );
}
