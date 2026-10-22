import { useLayoutEffect, type RefObject } from 'react';

const EXIT_MS = 180;
/** Bottom sheets slide all the way down, iOS-style. */
const SLIDE_MS = 280;
const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Phone bottom sheets leave the reverse of how they appear, however they
 * close (scrim, Escape, Save, Delete, a pull down): a bottom sheet (`.m-sheet`
 * or `.m-sheet-in`) slides off the bottom from wherever the finger left it
 * while the scrim fades; other panels fade out, easing down a little. The owner unmounts the sheet at once, so on unmount a static copy of
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

      const from = fromTransform === 'none' ? 'none' : fromTransform;
      if (panel.classList.contains('m-sheet') || panel.classList.contains('m-sheet-in')) {
        const opts = { duration: SLIDE_MS, easing: SLIDE_EASE, fill: 'forwards' as const };
        gp.style.transition = 'none';
        const slide = gp.animate([{ transform: from }, { transform: `${from === 'none' ? '' : from + ' '}translateY(100%)` }], opts);
        // The scrim: its own element, or the overlay's background.
        const scrim = ghost.querySelector<HTMLElement>(':scope > .m-scrim');
        if (scrim) scrim.animate([{ opacity: getComputedStyle(scrim).opacity }, { opacity: 0 }], opts);
        else ghost.animate([{ backgroundColor: getComputedStyle(root).backgroundColor }, { backgroundColor: 'transparent' }], opts);
        const done = () => ghost.remove();
        slide.onfinish = done;
        setTimeout(done, SLIDE_MS + 200);
        return;
      }
      const opts = { duration: EXIT_MS, easing: 'ease-in', fill: 'forwards' as const };
      gp.animate([{ transform: from, opacity: 1 }, { transform: `${from === 'none' ? '' : from + ' '}${toTransform}`, opacity: 0 }], opts);
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], opts);
      const remove = () => ghost.remove();
      fade.onfinish = remove;
      setTimeout(remove, EXIT_MS + 200);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
