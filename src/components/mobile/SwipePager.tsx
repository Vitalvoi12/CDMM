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
/** The finish after lift-off: quicker than iOS's own snap, which can't be tuned. */
const FINISH_MS = 220;
const MIN_FINISH_MS = 110;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
/** The ease's starting slope (y1 / x1), so a flick finishes at its own speed. */
const EASE_SLOPE = 0.61 / 0.22;
/** Scroll samples older than this don't count toward the flick speed. */
const VELOCITY_WINDOW_MS = 80;
/** How far ahead a flick is projected when picking the page it lands on. */
const PROJECT_MS = 250;
/** Share of the page width the (projected) drag must pass to turn. */
const TURN_FRACTION = 0.12;
/** A flick at least this fast (px/ms) toward a side turns to it, however short. */
const FLICK_SPEED = 0.15;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Phone page turning on the browser's own scrolling: the previous, current
 * and next periods sit side by side (or stacked, for `axis="y"`) in a
 * snapping scroller. The drag
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
 * Either sits inside a vertical scroller (the timeline: the three days scroll
 * together, so their hours line up) or fills a box whose pages each scroll
 * on their own (the Stat / Check / Notes tabs).
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
    const setPos = (v: number) => {
      if (x) el.scrollLeft = v;
      else el.scrollTop = v;
    };
    const size = () => (x ? el.clientWidth : el.clientHeight);
    const maxPos = () => (x ? el.scrollWidth : el.scrollHeight) - size();
    const freeze = (on: boolean) => {
      el.style[x ? 'overflowX' : 'overflowY'] = on ? 'hidden' : '';
      el.style.scrollSnapType = on ? 'none' : '';
    };
    // The scroller's recent positions while the finger drags, for the flick speed.
    let samples: { x: number; t: number }[] = [];
    // A finish in flight; a new touch completes it at once.
    let pending: { anims: Animation[]; commit: () => void } | null = null;

    const clearTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const atSide = () => (pos() <= 1 ? 'prev' : pos() >= maxPos() - 1 ? 'next' : null);
    const settle = () => {
      clearTimer();
      if (touchingRef.current || pending) return;
      const side = atSide();
      if (side) turn(side);
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
      const w = size();
      const mid = maxPos() / 2;
      const v = velocity();
      const offset = pos() - mid;
      if (Math.abs(offset) < 1 || !w) return false;
      // Turn once the drag, carried on by the flick, passes TURN_FRACTION;
      // a clear flick the way the drag went turns regardless.
      const projected = offset + v * PROJECT_MS;
      const page =
        Math.abs(v) >= FLICK_SPEED && Math.sign(v) === Math.sign(offset) ? Math.sign(v)
        : Math.abs(projected) > w * TURN_FRACTION ? Math.sign(projected)
        : 0;
      // Freeze the native scroll (and its momentum) where it is.
      freeze(true);
      const from = pos();
      const target = mid + page * w;
      const left = Math.abs(target - from);
      const speed = Math.sign(v) === Math.sign(target - from) ? Math.abs(v) : 0;
      const byDistance = Math.max(MIN_FINISH_MS, FINISH_MS * Math.min(1, left / w));
      const duration = speed > 0 ? Math.min(byDistance, Math.max(MIN_FINISH_MS, (EASE_SLOPE * left) / speed)) : byDistance;
      const panes = Array.from(el.children) as HTMLElement[];
      const anims = panes.map((p) =>
        p.animate([{ transform: 'translate(0, 0)' }, { transform: x ? `translate(${from - target}px, 0)` : `translate(0, ${from - target}px)` }], { duration, easing: EASE, fill: 'forwards' })
      );
      const commit = () => {
        if (pending?.commit !== commit) return;
        pending = null;
        // One task, one paint: scroll to where the slide ended, drop the
        // slide, then turn and re-centre.
        freeze(false);
        setPos(target);
        for (const a of anims) a.cancel();
        if (page) turn(page < 0 ? 'prev' : 'next');
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
        samples.push({ x: pos(), t });
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
      samples = [{ x: pos(), t: performance.now() }];
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
        freeze(false);
      }
      resize.disconnect();
      el.removeEventListener('scroll', onScroll);
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
