import { useEffect, useState, type RefObject } from 'react';

/**
 * Free vertical space (px) below `anchorRef` inside the <main> scroll
 * container, measured scroll-independently (rects + main.scrollTop).
 *
 * Why not ResizeObserver on a flex parent: the whole page column sizes to
 * content, so there is no observable "free space" — measuring the anchored
 * <main> (flex-1 of the dvh column, always viewport-sized) is the only
 * stable frame. Inputs never depend on the consumer's own height, so no
 * measure→grow→remeasure feedback loop is possible.
 */
export function useAvailableHeight(anchorRef: RefObject<HTMLDivElement | null>): number {
  const [avail, setAvail] = useState(0);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const compute = () => {
      const main = anchor.closest('main');
      if (!main) return;
      const mainRect = main.getBoundingClientRect();
      const r = anchor.getBoundingClientRect();
      const topInMain = r.top - mainRect.top + main.scrollTop;
      const padBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      const next = Math.max(0, Math.floor(main.clientHeight - topInMain - padBottom));
      setAvail((prev) => (prev === next ? prev : next));
    };
    // Fresh views start at the top — also makes the mount measurement exact.
    const mainEl = anchor.closest('main');
    if (mainEl) mainEl.scrollTop = 0;
    compute();
    const raf = requestAnimationFrame(compute);
    const t = setTimeout(compute, 300);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('resize', compute);
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return avail;
}
