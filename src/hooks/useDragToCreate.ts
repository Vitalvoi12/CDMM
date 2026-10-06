import { useCallback, useEffect, useRef, useState } from 'react';
import { bodyZoom } from '../utils/zoom';

export interface DragCreateDraft {
  /** Which column the draft lives in (day index, etc. — caller-defined). */
  columnKey: string;
  kind: 'real' | 'plan';
  /** Minutes from the top of the grid (START_HOUR), snapped. */
  startMin: number;
  endMin: number;
}

interface DragToCreateOptions {
  enabled: boolean;
  minutesPerPixel: number;
  /** Grid span in minutes — the draft is clamped to [0, totalMinutes]. */
  totalMinutes: number;
  snap: number;
  /** Fired on release after a real drag (not a plain click). */
  onCreate: (draft: DragCreateDraft) => void;
  /** Stamps the consumer's tap-guard so the click the browser fires on
   *  mouse-up does not ALSO open the 1-hour create form. */
  markGesture: () => void;
}

/** Pointer travel (layout px) before a press becomes a drag-to-create. */
const DRAG_THRESHOLD = 4;

/**
 * Press-and-drag on an empty timeline column to create an event spanning the
 * dragged range. While dragging, `draft` holds the live (snapped) range so the
 * view can paint a ghost block that stretches with the cursor. A press that
 * never travels past the threshold is left alone — the column's onClick still
 * handles it as a plain tap.
 */
export function useDragToCreate({ enabled, minutesPerPixel, totalMinutes, snap, onCreate, markGesture }: DragToCreateOptions) {
  const [draft, setDraft] = useState<DragCreateDraft | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const onMouseDown = useCallback(
    (columnKey: string, kind: 'real' | 'plan', e: React.MouseEvent<HTMLElement>) => {
      // Only presses on the bare column: event blocks / live session sit on top.
      if (!enabled || e.button !== 0 || e.target !== e.currentTarget) return;
      const column = e.currentTarget;
      const zoom = bodyZoom();
      // Re-measure on every move: the grid may scroll (wheel) mid-drag.
      const minutesAt = (clientY: number) => {
        const rect = column.getBoundingClientRect();
        const raw = ((clientY - rect.top) / zoom) * minutesPerPixel;
        return Math.max(0, Math.min(totalMinutes, Math.round(raw / snap) * snap));
      };
      const startY = e.clientY;
      const anchor = Math.min(minutesAt(startY), totalMinutes - snap);
      let current: DragCreateDraft | null = null;

      const onMove = (ev: MouseEvent) => {
        if (!current && Math.abs(ev.clientY - startY) / zoom <= DRAG_THRESHOLD) return;
        if (!current) {
          document.body.style.cursor = 'ns-resize';
          document.body.style.userSelect = 'none';
        }
        const at = minutesAt(ev.clientY);
        // Dragging up flips the range; never collapse below one snap step.
        const startMin = Math.min(anchor, at);
        let endMin = Math.max(anchor, at);
        if (endMin - startMin < snap) endMin = startMin + snap;
        if (current && current.startMin === startMin && current.endMin === endMin) return;
        current = { columnKey, kind, startMin, endMin };
        setDraft(current);
      };

      const cleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        cleanupRef.current = null;
      };

      const onUp = () => {
        cleanup();
        if (!current) return;
        markGesture();
        setDraft(null);
        onCreate(current);
      };

      cleanupRef.current?.();
      cleanupRef.current = cleanup;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [enabled, minutesPerPixel, totalMinutes, snap, onCreate, markGesture]
  );

  return { draft, onMouseDown };
}
