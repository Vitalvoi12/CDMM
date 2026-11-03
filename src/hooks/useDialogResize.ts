import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Keep a centered dialog steady when its results change, without scaling text. */
export function useDialogResize(panelRef: RefObject<HTMLElement | null>, contentKey: string) {
  const height = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    height.current = panel.offsetHeight;
    const observer = new ResizeObserver(() => { height.current = panel.offsetHeight; });
    observer.observe(panel);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => { if (reduced.matches) animation.current?.cancel(); };
    reduced.addEventListener('change', onChange);
    return () => {
      observer.disconnect();
      reduced.removeEventListener('change', onChange);
      animation.current?.cancel();
    };
  }, [panelRef]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previous = height.current;
    animation.current?.cancel();
    const next = panel.offsetHeight;
    height.current = next;
    if (previous === null || Math.abs(next - previous) < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animation.current = panel.animate([
      { height: `${previous}px`, overflow: 'hidden' },
      { height: `${next}px`, overflow: 'hidden' },
    ], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }, [panelRef, contentKey]);
}
