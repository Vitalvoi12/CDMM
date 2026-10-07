import { useEffect, useState } from 'react';

/** Furthest the content can be pulled (px): a small spring. */
const MAX_PULL = 64;
const RELEASE_MS = 850;
/** Very soft easeOutBack: a slow settle with a barely-there overshoot. */
const RELEASE_EASING = 'cubic-bezier(0.25, 1.08, 0.4, 1)';

/** Rubber-band curve: tracks the finger 1:1 at first, then stiffens toward MAX_PULL. */
function rubberBand(pull: number): number {
  const d = Math.abs(pull);
  return Math.sign(pull) * MAX_PULL * (1 - 1 / (d / MAX_PULL + 1));
}

/** True when a scroller between `target` and `root` can scroll on its own;
 *  that inner scroller owns the gesture, so the outer pane doesn't spring. */
function insideInnerScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== root) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 1) {
      const oy = getComputedStyle(node).overflowY;
      if (oy === 'auto' || oy === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Edge spring for a vertical scroll pane.
 *
 * When the pane's content overflows, the browser's own rubber-band does the
 * bounce (index.css turns overscroll back on for `.overscroll-spring`). It
 * runs on the compositor together with the scroll and fling, so it has no
 * seam; an earlier JS bounce layered over native scrolling always paused a
 * frame or two at the edge. The browser doesn't bounce a pane whose content
 * fits, so only then does this hook pull the pane's children with
 * resistance and spring them back on release.
 *
 * Only the children are moved (inline transform, cleared when the spring
 * settles), so the pane's own box and its siblings never shift, and no
 * transform is left behind to trap fixed-position dialogs. Horizontal swipes
 * and timeline event drags (body cursor `grabbing`) are left alone.
 *
 * Also toggles `.at-top` / `.at-bottom` so the edge fades in index.css only
 * show where there is more content to scroll to.
 */
export function useOverscrollSpring<T extends HTMLElement>(enabled = true) {
  // Callback ref (state), so a pane that mounts later still gets wired up.
  const [el, setEl] = useState<T | null>(null);

  useEffect(() => {
    if (!el || !enabled) return;
    el.classList.add('overscroll-spring');

    let start: { x: number; y: number } | null = null;
    let offset = 0;
    let settleTimer: number | null = null;

    const maxTop = () => el.scrollHeight - el.clientHeight;

    const updateEdges = () => {
      const top = el.scrollTop;
      el.classList.toggle('at-top', top <= 0);
      el.classList.toggle('at-bottom', top >= maxTop() - 1);
    };

    const apply = (y: number, animate: boolean) => {
      for (const child of Array.from(el.children) as HTMLElement[]) {
        child.style.transition = animate ? `transform ${RELEASE_MS}ms ${RELEASE_EASING}` : 'none';
        child.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
      }
    };
    const clear = () => {
      for (const child of Array.from(el.children) as HTMLElement[]) {
        child.style.transition = '';
        child.style.transform = '';
      }
    };

    const release = () => {
      start = null;
      if (!offset) return;
      offset = 0;
      apply(0, true);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        clear();
      }, RELEASE_MS);
    };

    const onStart = (e: TouchEvent) => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = null;
      clear();
      offset = 0;
      start = null;
      // Scrollable content gets the native bounce instead.
      if (e.touches.length !== 1 || maxTop() > 1 || insideInnerScroller(e.target, el)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      // A long-press event drag on the timeline owns this gesture.
      if (document.body.style.cursor === 'grabbing') {
        release();
        return;
      }
      const t = e.touches[0];
      const dy = t.clientY - start.y;
      // Vertical-dominant only, so horizontal day swipes never spring.
      if (!offset && Math.abs(dy) <= Math.abs(t.clientX - start.x)) return;
      offset = rubberBand(dy);
      apply(offset, false);
      if (e.cancelable) e.preventDefault();
    };

    updateEdges();
    const resize = new ResizeObserver(updateEdges);
    resize.observe(el);
    for (const child of Array.from(el.children)) resize.observe(child);

    el.addEventListener('scroll', updateEdges, { passive: true });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', release);
    el.addEventListener('touchcancel', release);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', release);
      el.removeEventListener('touchcancel', release);
      resize.disconnect();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      clear();
      el.classList.remove('overscroll-spring', 'at-top', 'at-bottom');
    };
  }, [el, enabled]);

  return setEl;
}
