import { useCallback, useRef } from 'react';

interface ButtonSwipeOptions {
  enabled?: boolean;
  /** Min travel (px) to count as a swipe. */
  threshold?: number;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Four-direction swipe that starts on a button (the mobile view-settings
 * button). Because the gesture is anchored to the button, it never competes
 * with scrolling or text selection in the content.
 *
 * Spread the returned handlers on the button and give it
 * `touch-action: none` so the browser never takes the gesture over. A swipe
 * cancels the tap that would follow it: `onTouchEnd` calls preventDefault
 * (which drops the synthesized click) and `wasSwipe()` is a fallback for
 * the button's own onClick.
 */
export function useButtonSwipe(options: ButtonSwipeOptions) {
  const { enabled = true, threshold = 40, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight } = options;
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedAtRef = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || e.touches.length !== 1) {
      startRef.current = null;
      return;
    }
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, [enabled]);

  const finish = useCallback((e: React.TouchEvent, touch: React.Touch | undefined) => {
    const s = startRef.current;
    startRef.current = null;
    if (!enabled || !s || !touch) return;
    const dx = touch.clientX - s.x;
    const dy = touch.clientY - s.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < threshold) return; // a tap
    swipedAtRef.current = Date.now();
    if (e.cancelable) e.preventDefault();
    // Dominant axis wins; a diagonal drag still resolves to its larger side.
    if (ay >= ax) (dy < 0 ? onSwipeUp : onSwipeDown)?.();
    else (dx < 0 ? onSwipeLeft : onSwipeRight)?.();
  }, [enabled, threshold, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => finish(e, e.changedTouches[0]), [finish]);
  const onTouchCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  /** True right after a swipe: the button's onClick should ignore it. */
  const wasSwipe = useCallback(() => Date.now() - swipedAtRef.current < 400, []);

  return { handlers: { onTouchStart, onTouchEnd, onTouchCancel }, wasSwipe };
}
