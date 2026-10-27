import { useLayoutEffect, useRef, useState } from 'react';

export interface PillItem<K extends string> {
  key: K;
  /** Material Symbols name. */
  icon: string;
  label: string;
  /** Count shown on the item while it isn't the picked one. */
  badge?: number;
}

interface PanelPillProps<K extends string> {
  /** Names the radio group for screen readers. */
  label: string;
  items: readonly PillItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** A second tap within DOUBLE_TAP_MS anywhere on the switch. */
  onDoubleTap: () => void;
  /** Distance of its bottom edge above the bottom nav, in layout px. */
  lift: number;
}

/** Top of an element in the page, summed over its offset parents. */
function pageTop(el: HTMLElement): number {
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  return top;
}

/** Longest gap between the two taps of a double tap. */
const DOUBLE_TAP_MS = 300;

/**
 * Phone calendar: a floating switch centred over the bottom of the view —
 * the day's panels (Day / Stat / Check / Notes) or, in the other views, the
 * range. The picked item shows its name beside the icon. It keeps one height
 * above the bottom nav whatever sits between (session bar, add bar), so it
 * doesn't jump when the panel changes.
 * A double tap opens the view sheet; the first tap still switches.
 * Timed by hand, since iOS doesn't reliably fire dblclick on buttons.
 */
export function PanelPill<K extends string>({ label, items, value, onChange, onDoubleTap, lift }: PanelPillProps<K>) {
  const ref = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(lift);
  const lastTap = useRef(0);

  // `bottom` is from the view's edge; measure how far that edge sits above the
  // nav and take it off. Offsets, not rects: the page's slide-in transform
  // would skew a rect, and offsets are already in layout px under the zoom.
  useLayoutEffect(() => {
    const box = ref.current?.offsetParent as HTMLElement | null;
    const nav = document.querySelector<HTMLElement>('nav.m-nav');
    if (!box || !nav) return;
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
  }, [lift]);

  const tap = (key: K) => {
    const now = performance.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    onChange(key);
  };

  return (
    <div ref={ref} className="m-pp" style={{ bottom }} role="radiogroup" aria-label={label}>
      {items.map(({ key, icon, label: name, badge }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={badge ? `${name}, ${badge} open` : name}
          className={value === key ? 'on' : ''}
          onClick={() => tap(key)}
        >
          <span className="material-symbols-outlined m-ic s">{icon}</span>
          {value === key && <span className="m-lbl">{name}</span>}
          {!!badge && value !== key && <span className="m-badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}
