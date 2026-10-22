import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';

/**
 * Id of the empty slot the phone shell renders right under the session dock.
 * A page portals a bar into it to sit below the dock instead of above it
 * (the Check tab's and Todo's add bars).
 */
export const BELOW_DOCK_ID = 'm-below-dock';

/**
 * The slot for a page's add bar (portal into it). While typing the bar is
 * fixed above the keyboard and leaves the slot, so the dock would drop onto
 * the nav and slide under the bar's chip rows. The slot then keeps what the
 * nav (right under it, covered by the bar) doesn't fill.
 */
export function useBelowDock(formRef: RefObject<HTMLFormElement | null>, focused: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setSlot(document.getElementById(BELOW_DOCK_ID)), []);
  useEffect(() => {
    const form = formRef.current;
    if (!focused || !slot || !form) return;
    const hold = () => {
      const nav = (slot.nextElementSibling as HTMLElement | null)?.offsetHeight ?? 0;
      slot.style.minHeight = `${Math.max(0, form.offsetHeight - nav)}px`;
    };
    hold();
    const ro = new ResizeObserver(hold);
    ro.observe(form);
    return () => {
      ro.disconnect();
      slot.style.minHeight = '';
    };
  }, [focused, slot, formRef]);
  return slot;
}

// A page can hide the session dock (the calendar does outside its timeline).
let dockHidden = false;
const dockListeners = new Set<() => void>();

export function setDockHidden(hidden: boolean): void {
  if (hidden === dockHidden) return;
  dockHidden = hidden;
  dockListeners.forEach((l) => l());
}

export function useDockHidden(): boolean {
  return useSyncExternalStore(
    (l) => {
      dockListeners.add(l);
      return () => dockListeners.delete(l);
    },
    () => dockHidden
  );
}
