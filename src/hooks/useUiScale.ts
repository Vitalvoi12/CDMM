import { useCallback, useState } from 'react';

const STORAGE_KEY = 'cdmm.uiScale';
const MOBILE_MQ = '(max-width: 1023px)';
/** The layout's own zoom before the user's scale: the phone UI is drawn at 0.88. */
const BASE_ZOOM = { mobile: 0.88, desktop: 1 };

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.2] as const;

/**
 * Interface size is a device preference (a phone and a desktop want different
 * sizes), so it lives in localStorage and is not synced like the theme.
 */
function readScale(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return (UI_SCALES as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

/** Sets --app-zoom, the body zoom every layout and pointer calculation reads. */
function applyScale(scale: number) {
  const mobile = window.matchMedia(MOBILE_MQ).matches;
  const zoom = (mobile ? BASE_ZOOM.mobile : BASE_ZOOM.desktop) * scale;
  document.documentElement.style.setProperty('--app-zoom', String(Math.round(zoom * 1000) / 1000));
}

export function useUiScale() {
  const [scale, setScaleState] = useState(readScale);

  const setScale = useCallback((next: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Private mode: the size still applies for this visit.
    }
    applyScale(next);
    setScaleState(next);
  }, []);

  return { scale, setScale };
}

/** Apply the saved size at startup, and again when crossing the phone breakpoint. */
export function initUiScale() {
  applyScale(readScale());
  window.matchMedia(MOBILE_MQ).addEventListener('change', () => applyScale(readScale()));
}
