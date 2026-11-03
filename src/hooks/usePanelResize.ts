import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Animate a deliberate flex-panel resize; typing and viewport changes stay immediate. */
export function usePanelResize(panelRef: RefObject<HTMLElement | null>, expanded: boolean, enabled: boolean) {
  const lastHeight = useRef<number | null>(null);
  const lastExpanded = useRef(expanded);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !enabled) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { lastHeight.current = panel.getBoundingClientRect().height; };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    const reduce = () => { if (motion.matches) animation.current?.cancel(); };
    motion.addEventListener('change', reduce);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', reduce);
      animation.current?.cancel();
    };
  }, [panelRef, enabled]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const changed = lastExpanded.current !== expanded;
    lastExpanded.current = expanded;
    if (!panel || !enabled || !changed) return;
    const previous = lastHeight.current;
    animation.current?.cancel();
    const next = panel.getBoundingClientRect().height;
    lastHeight.current = next;
    if (previous === null || Math.abs(previous - next) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Animate layout rather than scaling the card: text and the editor stay sharp.
    // The adjacent checklist naturally takes the remaining space on each frame.
    animation.current = panel.animate([
      { flexGrow: 0, flexShrink: 0, flexBasis: `${previous}px` },
      { flexGrow: 0, flexShrink: 0, flexBasis: `${next}px` },
    ], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }, [panelRef, expanded, enabled]);
}
