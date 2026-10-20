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

const TURN_MS = 260;

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

  // Velocity tracking for a flick: the last two finger samples.
  const lastRef = useRef<{ x: number; t: number; px: number; pt: number } | null>(null);
  // A turn in flight: its animations and the swap that ends it. A new touch
  // finishes it at once, so quick flicks page through without waiting.
  const pendingRef = useRef<{ anims: Animation[]; commit: () => void } | null>(null);

  /** The page plus its pre-rendered neighbours, marked data-swipe-peek="prev"
   *  / "next" and laid out one page width to each side. They are either the
   *  page's siblings (moved along with it, own scroll synced) or its children
   *  (carried by the page's own transform). */
  const strip = useCallback(() => {
    const el = pageRef?.current ?? null;
    const find = (root: Element | null | undefined, which: string) =>
      root?.querySelector<HTMLElement>(`:scope > [data-swipe-peek="${which}"]`) ?? null;
    const sibPrev = find(el?.parentElement, 'prev');
    const sibNext = find(el?.parentElement, 'next');
    return {
      el,
      prev: sibPrev ?? find(el, 'prev'),
      next: sibNext ?? find(el, 'next'),
      siblings: [sibPrev, sibNext].filter((n): n is HTMLElement => !!n),
    };
  }, [pageRef]);

  /** Everything that needs its own transform. */
  const stripEls = useCallback(() => {
    const { el, siblings } = strip();
    return el ? [el, ...siblings] : [];
  }, [strip]);

  /** Sibling neighbours open at the page's scroll position, so hours line up. */
  const syncNeighbours = useCallback(() => {
    const { el, siblings } = strip();
    if (!el) return;
    for (const n of siblings) {
      n.scrollTop = el.scrollTop;
      n.scrollLeft = el.scrollLeft;
    }
  }, [strip]);

  /** Move the strip with the finger (no animation). */
  const follow = useCallback((dx: number) => {
    offsetRef.current = dx;
    for (const n of stripEls()) n.style.transform = dx ? `translateX(${dx}px)` : '';
  }, [stripEls]);

  /** Not a swipe after all: ease the strip back into place. */
  const settle = useCallback(() => {
    const from = offsetRef.current;
    offsetRef.current = 0;
    if (!from) return;
    for (const n of stripEls()) {
      n.style.transform = '';
      if (!reducedMotion()) {
        n.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], { duration: 200, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' });
      }
    }
  }, [stripEls]);

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

  // Page turn, carousel style: the neighbouring periods are already rendered
  // beside the page and travel with the finger, so the next timeline is on
  // screen from the first pixel of the drag. Lift-off slides the strip the
  // rest of the way; only then does the period change, and since the page
  // now renders exactly what the neighbour showed, the swap is invisible.
  // Only transforms animate (iOS WebKit blanked pages fading in from
  // opacity 0).
  const navigate = useCallback((dir: 'left' | 'right' | null) => {
    const { el, prev, next } = strip();
    const from = offsetRef.current;
    offsetRef.current = 0;
    const incoming = dir === 'left' ? next : dir === 'right' ? prev : null;
    const els = stripEls();
    if (!dir || !el || !incoming || reducedMotion()) {
      for (const n of els) n.style.transform = '';
      go(dir);
      return;
    }
    const w = el.offsetWidth || window.innerWidth;
    const to = dir === 'left' ? -w : w;
    // The shorter the way left, the quicker the finish.
    const duration = Math.max(140, TURN_MS * Math.min(1, Math.abs(to - from) / w));
    const timing = { duration, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' };
    turningRef.current = true;
    const anims = els.map((n) => {
      n.style.transform = `translateX(${to}px)`;
      return n.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], timing);
    });
    const commit = () => {
      if (pendingRef.current?.commit !== commit) return;
      pendingRef.current = null;
      // Same frame: the page takes the new period and the strip snaps home.
      flushSync(() => go(dir));
      for (const n of els) n.style.transform = '';
      turningRef.current = false;
    };
    pendingRef.current = { anims, commit };
    anims[0].onfinish = commit;
  }, [strip, stripEls, go]);

  /** Finish a running turn immediately (a new touch arrived). */
  const finishTurn = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    for (const a of p.anims) a.cancel();
    p.commit();
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    decidedRef.current = null;
    axisRef.current = null;
    finishTurn();
    if (!enabled || turningRef.current || e.touches.length !== 1) {
      startRef.current = null;
      return;
    }
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    lastRef.current = { x: t.clientX, t: Date.now(), px: t.clientX, pt: Date.now() };
  }, [enabled, finishTurn]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    if (!enabled || !s) return;
    const t = e.touches[0];
    if (!t) return;
    // Stale starts (long-press, interrupted gestures) never navigate. A drag
    // already moving the page sideways may take its time.
    if (axisRef.current !== 'x' && Date.now() - s.t > 1000) {
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
      if (axisRef.current === 'x') syncNeighbours();
    }
    const l = lastRef.current;
    if (l) lastRef.current = { x: t.clientX, t: Date.now(), px: l.x, pt: l.t };
    if (axisRef.current === 'x') follow(dx);
    decide(dx, dy);
  }, [enabled, decide, follow, settle, syncNeighbours]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    const decided = decidedRef.current;
    startRef.current = null;
    decidedRef.current = null;
    if (!enabled || !s) {
      settle();
      return;
    }
    if (decided && axisRef.current === 'x' && offsetRef.current) {
      // The page is in the finger: where it was let go decides. Dragged back
      // toward home (and not flicked onward) means "stay".
      const dx = offsetRef.current;
      const l = lastRef.current;
      const v = l && l.t > l.pt ? (l.x - l.px) / (l.t - l.pt) : 0;
      const onward = Math.sign(v) === Math.sign(dx) && Math.abs(v) > 0.3;
      if (Math.abs(dx) >= threshold || onward) navigate(dx < 0 ? 'left' : 'right');
      else settle();
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
