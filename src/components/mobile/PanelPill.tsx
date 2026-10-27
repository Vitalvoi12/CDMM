import { useLayoutEffect, useRef } from 'react';
import { setPillLift, useBottomAboveNav, useToastUp } from './pillSlot';

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
  /** Shown with no session running: a ▶ button beside the switch starts one. */
  onStart?: () => void;
}

/** Height of the switch (and the ▶ button): 44px items, 4px padding, 1px border. */
const PILL_PX = 54;
/** Room kept between the last row of a list and the switch. */
const CLEAR_GAP_PX = 12;

/** Longest gap between the two taps of a double tap. */
const DOUBLE_TAP_MS = 300;

/**
 * Phone calendar: a floating switch centred over the bottom of the view —
 * the day's panels (Day / Stat / Check / Notes) or, in the other views, the
 * range. The picked item shows its name beside the icon. It keeps one height
 * above the bottom nav whatever sits between (session bar, add bar), so it
 * doesn't jump when the panel changes. Its box gets `--pill-clear`, the
 * bottom padding that lets a list scroll its last row above the switch
 * (.m-pill-clear). While the undo toast is up, the toast takes its place.
 * A double tap opens the view sheet; the first tap still switches.
 * Timed by hand, since iOS doesn't reliably fire dblclick on buttons.
 */
export function PanelPill<K extends string>({ label, items, value, onChange, onDoubleTap, lift, onStart }: PanelPillProps<K>) {
  const ref = useRef<HTMLDivElement>(null);
  const bottom = useBottomAboveNav(ref, lift);
  const toastUp = useToastUp();
  const lastTap = useRef(0);

  useLayoutEffect(() => {
    setPillLift(lift);
    return () => setPillLift(null);
  }, [lift]);

  useLayoutEffect(() => {
    const box = ref.current?.offsetParent as HTMLElement | null;
    if (!box) return;
    box.style.setProperty('--pill-clear', `${bottom + PILL_PX + CLEAR_GAP_PX}px`);
    return () => {
      box.style.removeProperty('--pill-clear');
    };
  }, [bottom]);

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
    <>
      <div ref={ref} className="m-pp" style={{ bottom, visibility: toastUp ? 'hidden' : undefined }} role="radiogroup" aria-label={label}>
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
      {onStart && (
        <button type="button" className="m-pp-start" style={{ bottom, visibility: toastUp ? 'hidden' : undefined }} aria-label="Start session" onClick={onStart}>
          <span className="material-symbols-outlined m-ic l">play_arrow</span>
        </button>
      )}
    </>
  );
}
