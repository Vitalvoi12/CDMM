import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { bodyZoom } from '../utils/zoom';

interface Drag {
  id: string;
  pointerId: number;
  grid: HTMLDivElement;
  source: HTMLElement;
  startX: number;
  startY: number;
  active: boolean;
  target: HTMLElement | null;
}

const DRAG_THRESHOLD = 5;
const QUADRANT = '[data-todo-quadrant]';

export function useTodoQuadrantDrag(enabled: boolean, onDrop: (id: string, quadrant: string) => void) {
  const ghost = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.defaultPrevented) return;
    if (!(event.target instanceof Element) || event.target.closest('button, input, a')) return;
    const row = event.target.closest<HTMLElement>('[data-todo-task]');
    const source = row?.closest<HTMLElement>(QUADRANT);
    if (!source || !row?.dataset.todoTask) return;
    drag.current = {
      id: row.dataset.todoTask,
      pointerId: event.pointerId,
      grid: event.currentTarget,
      source,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null,
    };
  }

  useEffect(() => {
    if (!enabled) return;
    let frame: number | undefined;
    let x = 0;
    let y = 0;
    let blockClick = false;

    const targetAt = (current: Drag, x: number, y: number) => {
      const card = document.elementFromPoint(x, y)?.closest<HTMLElement>(QUADRANT);
      return card && card !== current.source && current.grid.contains(card) ? card : null;
    };

    const paint = () => {
      frame = undefined;
      const current = drag.current;
      if (!current?.active || !ghost.current) return;
      const zoom = bodyZoom();
      ghost.current.style.transform = `translate3d(${x / zoom}px, ${y / zoom}px, 0) translate(-50%, -50%)`;
      ghost.current.hidden = false;
      const target = targetAt(current, x, y);
      if (target === current.target) return;
      current.target?.removeAttribute('data-todo-drop-active');
      target?.setAttribute('data-todo-drop-active', '');
      current.target = target;
    };

    const finish = () => {
      const current = drag.current;
      drag.current = null;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      current?.target?.removeAttribute('data-todo-drop-active');
      current?.grid.removeAttribute('data-todo-dragging');
      if (ghost.current) ghost.current.hidden = true;
      if (current?.grid.hasPointerCapture(current.pointerId)) {
        current.grid.releasePointerCapture(current.pointerId);
      }
    };

    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!(event.buttons & 1)) {
        finish();
        return;
      }
      x = event.clientX;
      y = event.clientY;
      if (!current.active) {
        if (Math.hypot(x - current.startX, y - current.startY) < DRAG_THRESHOLD) return;
        current.grid.setPointerCapture(event.pointerId);
        current.grid.setAttribute('data-todo-dragging', '');
        current.active = true;
        blockClick = true;
      }
      if (frame === undefined) frame = requestAnimationFrame(paint);
    };

    const release = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId || event.button !== 0) return;
      const target = current.active ? targetAt(current, event.clientX, event.clientY) : null;
      finish();
      const quadrant = target?.dataset.todoQuadrant;
      if (quadrant) onDrop(current.id, quadrant);
    };

    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId) finish();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current?.active) return;
      event.preventDefault();
      event.stopPropagation();
      finish();
    };
    const startPress = () => { blockClick = false; };
    const onClick = (event: MouseEvent) => {
      if (!blockClick || event.detail === 0) return;
      blockClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointerdown', startPress, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancelPointer);
    window.addEventListener('lostpointercapture', cancelPointer);
    window.addEventListener('blur', finish);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      finish();
      window.removeEventListener('pointerdown', startPress, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancelPointer);
      window.removeEventListener('lostpointercapture', cancelPointer);
      window.removeEventListener('blur', finish);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [enabled, onDrop]);

  return { ghost, onPointerDown };
}
