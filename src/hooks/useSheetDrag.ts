import { useEffect, useRef, type RefObject } from 'react';

const DECIDE_PX = 6;
/** A release faster than this (layout px/ms, downwards) closes the sheet. */
const FLICK_V = 0.5;

/**
 * Phone bottom sheets: pull one down anywhere to close it, like iOS. A
 * downward drag that starts with the content scrolled to its top moves the
 * sheet with the finger (the scrim lightens with it); letting go past a
 * quarter of its height, or with a flick, closes it — the exit animation
 * (useSheetExit) carries on from where the finger left it. Otherwise it springs
 * back. Drags inside content that is scrolled down just scroll it.
 *
 * Native, non-passive listeners: the pull must cancel the browser's own
 * scroll/bounce, which React's passive touch listeners cannot.
 */
export function useSheetDrag(panelRef: RefObject<HTMLElement | null>, onClose: () => void, scrimRef?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = panelRef.current;
    if (!el || !window.matchMedia('(max-width: 1023px)').matches) return;
    let s: { x: number; y: number; dy: number; mode: 'none' | 'pull' | 'no'; ly: number; lt: number; v: number } | null = null;
    const zoom = () => parseFloat(getComputedStyle(document.body).zoom) || 1;
    const scrim = () => scrimRef?.current ?? null;

    // Any scrolled-down box between the finger and the sheet takes the drag.
    const scrolled = (target: EventTarget | null) => {
      for (let n = target as HTMLElement | null; n && n !== el.parentElement; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
        if (n === el) break;
      }
      return false;
    };

    const place = (dy: number, ms: number) => {
      el.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.32, 0.72, 0, 1)` : 'none';
      el.style.transform = dy ? `translateY(${dy}px)` : '';
      const sc = scrim();
      if (sc) {
        sc.style.transition = ms ? `opacity ${ms}ms ease-out` : 'none';
        sc.style.opacity = dy ? String(Math.max(0, 1 - dy / (el.offsetHeight || 1))) : '';
      }
    };

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        s = null;
        return;
      }
      const t = e.touches[0];
      s = { x: t.clientX, y: t.clientY, dy: 0, mode: 'none', ly: t.clientY, lt: e.timeStamp, v: 0 };
    };
    const move = (e: TouchEvent) => {
      if (!s || s.mode === 'no') return;
      const t = e.touches[0];
      const z = zoom();
      const dx = (t.clientX - s.x) / z;
      const dy = (t.clientY - s.y) / z;
      if (s.mode === 'none') {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        s.mode = dy > 0 && dy > Math.abs(dx) && !scrolled(e.target) ? 'pull' : 'no';
        if (s.mode === 'no') return;
        // Typing stops being the point once the sheet is on its way out.
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      e.preventDefault();
      const dt = e.timeStamp - s.lt;
      if (dt > 0) s.v = (t.clientY - s.ly) / z / dt;
      s.ly = t.clientY;
      s.lt = e.timeStamp;
      s.dy = Math.max(0, dy);
      place(s.dy, 0);
    };
    const end = () => {
      const cur = s;
      s = null;
      if (!cur || cur.mode !== 'pull') return;
      if (cur.dy > el.offsetHeight * 0.25 || (cur.v > FLICK_V && cur.dy > 12)) {
        closeRef.current();
        return;
      }
      place(0, 320);
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [panelRef, scrimRef]);
}
