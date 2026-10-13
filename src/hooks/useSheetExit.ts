import { useLayoutEffect, type RefObject } from 'react';

const EXIT_MS = 180;

/**
 * Phone bottom sheets fade out when they close, the reverse of how they
 * appear, however they close (scrim, Escape, Save, Delete, pull on the grab
 * bar). The owner unmounts the sheet at once, so on unmount a static copy of
 * the overlay is left on body, fades out with its panel easing down a little,
 * then the copy is removed. Desktop dialogs keep closing instantly.
 */
export function useSheetExit(rootRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    // Capture now: the refs may already be detached by cleanup time.
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;
    return () => {
      if (!root.isConnected || !window.matchMedia('(max-width: 1023px)').matches) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      // Path from root to panel, to find the panel inside the copy.
      const path: number[] = [];
      for (let n: Element = panel; n !== root; n = n.parentElement!) {
        path.unshift(Array.prototype.indexOf.call(n.parentElement!.children, n));
      }
      const fromTransform = getComputedStyle(panel).transform;
      const scrollTop = panel.scrollTop;
      // Reverse of the panel's entrance animation.
      const toTransform = panel.classList.contains('animate-pop-in') ? 'scale(0.96) translateY(6px)' : 'translateY(24px)';

      const ghost = root.cloneNode(true) as HTMLElement;
      ghost.classList.add('sheet-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.removeAttribute('id');
      document.body.appendChild(ghost);
      let ghostPanel: Element = ghost;
      for (const i of path) ghostPanel = ghostPanel.children[i];
      const gp = ghostPanel as HTMLElement;
      gp.scrollTop = scrollTop;

      const opts = { duration: EXIT_MS, easing: 'ease-in', fill: 'forwards' as const };
      const from = fromTransform === 'none' ? 'none' : fromTransform;
      gp.animate([{ transform: from, opacity: 1 }, { transform: `${from === 'none' ? '' : from + ' '}${toTransform}`, opacity: 0 }], opts);
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], opts);
      const remove = () => ghost.remove();
      fade.onfinish = remove;
      setTimeout(remove, EXIT_MS + 200);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
