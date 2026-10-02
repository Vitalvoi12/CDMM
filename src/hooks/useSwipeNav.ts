import { useCallback, useRef } from 'react';

interface SwipeNavOptions {
  enabled?: boolean;
  /** Min horizontal travel (px) to count as a swipe. */
  threshold?: number;
  /** Fired on a completed swipe. The consumer stamps its tap-guard here so
   *  the click synthesized after touchend doesn't open the create form. */
  markGesture?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

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
  const { enabled = true, threshold = 64, markGesture, onSwipeLeft, onSwipeRight } = options;
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const decidedRef = useRef<'left' | 'right' | null>(null);

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
  const navigate = useCallback((dir: 'left' | 'right' | null) => {
    if (dir === 'left') onSwipeLeft?.();
    else if (dir === 'right') onSwipeRight?.();
  }, [onSwipeLeft, onSwipeRight]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    decidedRef.current = null;
    if (!enabled || e.touches.length !== 1) {
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
      return;
    }
    decide(t.clientX - s.x, t.clientY - s.y);
  }, [enabled, decide]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    const decided = decidedRef.current;
    startRef.current = null;
    decidedRef.current = null;
    if (!enabled || !s) return;
    if (decided) {
      // Direction was settled mid-gesture; lift-off only confirms it.
      navigate(decided);
      return;
    }
    const t = e.changedTouches[0];
    if (!t) return;
    // Stale starts (long-press, interrupted gestures) never navigate.
    if (Date.now() - s.t > 1000) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    markGesture?.();
    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }, [enabled, threshold, markGesture, onSwipeLeft, onSwipeRight, navigate]);

  const onTouchCancel = useCallback(() => {
    // The browser took the gesture over mid-flight (scroll takeover, alert).
    // If the swipe was already unambiguous, honour it anyway.
    const decided = decidedRef.current;
    const s = startRef.current;
    startRef.current = null;
    decidedRef.current = null;
    if (!enabled || !s || !decided) return;
    navigate(decided);
  }, [enabled, navigate]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
