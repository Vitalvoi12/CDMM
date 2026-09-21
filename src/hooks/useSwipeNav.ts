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
 * dominant horizontal flick navigates. Touches that begin on an event
 * block (`[data-event-id]`) belong to event gestures and are ignored.
 */
export function useSwipeNav(options: SwipeNavOptions) {
  const { enabled = true, threshold = 64, markGesture, onSwipeLeft, onSwipeRight } = options;
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const clear = useCallback(() => {
    startRef.current = null;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || e.touches.length !== 1) {
      startRef.current = null;
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('[data-event-id]')) {
      startRef.current = null;
      return;
    }
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, [enabled]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    startRef.current = null;
    if (!enabled || !s) return;
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
  }, [enabled, threshold, markGesture, onSwipeLeft, onSwipeRight]);

  return { onTouchStart, onTouchEnd, onTouchCancel: clear };
}
