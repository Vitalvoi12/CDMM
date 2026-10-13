import { useCallback, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';

interface SwipeNavOptions {
  enabled?: boolean;
  /** Min horizontal travel (px) to count as a swipe. */
  threshold?: number;
  /** Fired on a completed swipe. The consumer stamps its tap-guard here so
   *  the click synthesized after touchend doesn't open the create form. */
  markGesture?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Page element that follows the finger sideways and slides out/in when
   *  the swipe navigates (a page turn). Without it the swipe just navigates. */
  pageRef?: RefObject<HTMLElement | null>;
}

const OUT_MS = 150;
const IN_MS = 220;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Horizontal swipe navigation for mobile timelines. Never calls
 * preventDefault, so native vertical scrolling is untouched; only a
 * dominant horizontal flick navigates. Touches may begin on event blocks
 * too — a fast horizontal flick still swipes the timeline, while taps,
 * long-presses and vertical drags are filtered out by the guards below
 * (travel threshold, horizontal dominance, 1s staleness).
 *
 * Two things make this reliable where a naive start/end pair is not:
 * - consumers declare `touch-action: pan-y` on the surface, so the browser
 *   keeps vertical scrolling but can never hijack a horizontal flick (which
 *   would arrive here as touchcancel and kill the gesture);
 * - the direction is decided while the finger is still moving, so even if
 *   the browser does take over (touchcancel), the swipe still navigates.
 */
export function useSwipeNav(options: SwipeNavOptions) {
  const { enabled = true, threshold = 64, markGesture, onSwipeLeft, onSwipeRight, pageRef } = options;
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const decidedRef = useRef<'left' | 'right' | null>(null);
  // Page-turn state: the locked axis of the current gesture, the page's
  // current sideways offset, and whether a turn animation is running.
  const axisRef = useRef<'x' | 'y' | null>(null);
  const offsetRef = useRef(0);
  const turningRef = useRef(false);

  /** Move the page with the finger (no animation). */
  const follow = useCallback((dx: number) => {
    const el = pageRef?.current;
    if (!el) return;
    offsetRef.current = dx;
    el.style.transform = dx ? `translateX(${dx}px)` : '';
  }, [pageRef]);

  /** Not a swipe after all: ease the page back into place. */
  const settle = useCallback(() => {
    const el = pageRef?.current;
    const from = offsetRef.current;
    offsetRef.current = 0;
    if (!el || !from) return;
    el.style.transform = '';
    if (!reducedMotion()) {
      el.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], { duration: 200, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' });
    }
  }, [pageRef]);

  /** Record the swipe direction the moment the travel is unambiguous. */
  const decide = useCallback(
    (dx: number, dy: number) => {
      if (decidedRef.current) return;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      decidedRef.current = dx < 0 ? 'left' : 'right';
      // Stamp the tap-guard now, not at lift-off: the click synthesized after
      // the gesture lands on a background column and must not open the form.
      markGesture?.();
    },
    [threshold, markGesture]
  );

  // NOTE: takes the decision as a value, never from the ref — callers clear
  // the ref before navigating, so reading it here would always see null.
  const go = useCallback((dir: 'left' | 'right' | null) => {
    if (dir === 'left') onSwipeLeft?.();
    else if (dir === 'right') onSwipeRight?.();
  }, [onSwipeLeft, onSwipeRight]);

  // Page turn: the old page slides off the way the finger went, the period
  // changes, the new page slides in from the other side.
  const navigate = useCallback((dir: 'left' | 'right' | null) => {
    const el = pageRef?.current;
    const from = offsetRef.current;
    offsetRef.current = 0;
    if (!dir || !el || reducedMotion()) {
      if (el) el.style.transform = '';
      go(dir);
      return;
    }
    const sign = dir === 'left' ? -1 : 1;
    const w = el.offsetWidth || window.innerWidth;
    turningRef.current = true;
    el.style.transform = `translateX(${sign * w}px)`;
    el.style.opacity = '0';
    const out = el.animate(
      [{ transform: `translateX(${from}px)`, opacity: 1 }, { transform: `translateX(${sign * w}px)`, opacity: 0.3 }],
      { duration: OUT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)' }
    );
    out.onfinish = out.oncancel = () => {
      el.style.transform = '';
      el.style.opacity = '';
      // Render the new period now so it, not the old one, slides in.
      flushSync(() => go(dir));
      const page = pageRef?.current;
      turningRef.current = false;
      page?.animate(
        [{ transform: `translateX(${-sign * w * 0.35}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
        { duration: IN_MS, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
      );
    };
  }, [pageRef, go]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    decidedRef.current = null;
    axisRef.current = null;
    if (!enabled || turningRef.current || e.touches.length !== 1) {
      startRef.current = null;
      return;
    }
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, [enabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    if (!enabled || !s) return;
    const t = e.touches[0];
    if (!t) return;
    // Stale starts (long-press, interrupted gestures) never navigate.
    if (Date.now() - s.t > 1000) {
      startRef.current = null;
      settle();
      return;
    }
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Lock the axis on the first clear movement; only a sideways gesture
    // drags the page, so vertical scrolling never wobbles it.
    if (!axisRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      axisRef.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    }
    if (axisRef.current === 'x') follow(dx);
    decide(dx, dy);
  }, [enabled, decide, follow, settle]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    const decided = decidedRef.current;
    startRef.current = null;
    decidedRef.current = null;
    if (!enabled || !s) {
      settle();
      return;
    }
    if (decided) {
      // Direction was settled mid-gesture; lift-off only confirms it.
      navigate(decided);
      return;
    }
    const t = e.changedTouches[0];
    // Stale starts (long-press, interrupted gestures) never navigate.
    if (!t || Date.now() - s.t > 1000) {
      settle();
      return;
    }
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) {
      settle();
      return;
    }
    markGesture?.();
    navigate(dx < 0 ? 'left' : 'right');
  }, [enabled, threshold, markGesture, navigate, settle]);

  const onTouchCancel = useCallback(() => {
    // The browser took the gesture over mid-flight (scroll takeover, alert).
    // If the swipe was already unambiguous, honour it anyway.
    const decided = decidedRef.current;
    const s = startRef.current;
    startRef.current = null;
    decidedRef.current = null;
    if (!enabled || !s || !decided) {
      settle();
      return;
    }
    navigate(decided);
  }, [enabled, navigate, settle]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
