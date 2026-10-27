import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';

/**
 * The calendar's floating switch (PanelPill) and the undo toast share one
 * slot: while the toast is up the switch hides and the toast sits where it
 * was. The switch publishes its height above the nav; the toast says when
 * it is showing.
 */
let pillLift: number | null = null;
let toastUp = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The switch's bottom edge above the nav in layout px, or null when no switch is on screen. */
export function setPillLift(lift: number | null): void {
  if (lift === pillLift) return;
  pillLift = lift;
  notify();
}

export function usePillLift(): number | null {
  return useSyncExternalStore(subscribe, () => pillLift);
}

export function setToastUp(up: boolean): void {
  if (up === toastUp) return;
  toastUp = up;
  notify();
}

export function useToastUp(): boolean {
  return useSyncExternalStore(subscribe, () => toastUp);
}

/** Top of an element in the page, summed over its offset parents. */
function pageTop(el: HTMLElement): number {
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  return top;
}

/**
 * `bottom` for an absolutely placed element so its bottom edge sits `lift`
 * px above the bottom nav, whatever lies between its box and the nav
 * (session bar, add bar). Offsets, not rects: the page's slide-in transform
 * would skew a rect, and offsets are already in layout px under the zoom.
 * `mount` changes whenever the element is (re)mounted, so it is measured again.
 */
export function useBottomAboveNav(ref: RefObject<HTMLElement | null>, lift: number | null, mount?: unknown): number {
  const [bottom, setBottom] = useState(lift ?? 0);
  useLayoutEffect(() => {
    const box = ref.current?.offsetParent as HTMLElement | null;
    const nav = document.querySelector<HTMLElement>('nav.m-nav');
    if (lift === null || !box || !nav) return;
    const measure = () => {
      const gap = pageTop(nav) - (pageTop(box) + box.offsetHeight);
      const next = Math.round(lift - gap);
      setBottom((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(nav);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, lift, mount]);
  return bottom;
}
