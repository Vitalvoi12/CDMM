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
      const mainEl = main as HTMLElement;
      // Scroll-independent position: the day section may already be scrolled
      // to "now" by the time this runs (child effects first), and rects move
      // with scroll — offsetTop does not. All values are layout px (never
      // mix in getBoundingClientRect, which is visual px and diverges under
      // any CSS zoom).
      const docTop = (el: HTMLElement | null): number => {
        let top = 0;
        let cur: HTMLElement | null = el;
        while (cur) {
          top += cur.offsetTop;
          cur = cur.offsetParent as HTMLElement | null;
        }
        return top;
      };
      const topInMain = docTop(anchor as HTMLElement) - docTop(mainEl);
      const padBottom = parseFloat(getComputedStyle(mainEl).paddingBottom) || 0;
      const next = Math.max(0, Math.floor(mainEl.clientHeight - topInMain - padBottom));
      setAvail((prev) => (prev === next ? prev : next));
    };
    // Fresh views start at the top — also makes the mount measurement exact.
    const mainEl = anchor.closest('main');
    if (mainEl) mainEl.scrollTop = 0;
    compute();
    const raf = requestAnimationFrame(compute);
    // Late settlers (webfonts, icon font) shift chrome heights after mount —
    // re-measure so the grid keeps filling to the bottom.
    const t1 = setTimeout(compute, 300);
    const t2 = setTimeout(compute, 1200);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => compute()).catch(() => {});
    }
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => compute());
      // Observe the whole ancestor chain up to <main>: any redistribution
      // above the grid (header wrap, font swap, toolbar appearing) resizes
      // some link and triggers a re-measure at any moment, not just on
      // mount. The grid's own resizes also fire, but compute() no-ops when
      // avail is unchanged (setAvail guard), so no feedback loop.
      let el: Element | null = anchor;
      while (el) {
        ro.observe(el);
        if (el === mainEl) break;
        el = el.parentElement;
      }
    }
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('resize', compute);
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return avail;
}
