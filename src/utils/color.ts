/**
 * Readable foreground for a solid subject-color background (YIQ brightness).
 * Theme-independent: near-black on light colors, white on dark ones, so
 * planned events stay legible on any subject color in any theme.
 */
export function contrastOn(hex: string): string {
  const c = (hex || '').replace('#', '');
  const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#131312' : '#ffffff';
}

const DARK_THEMES = new Set(['mocha', 'bw-dark']);

/** True on dark themes (mocha, bw-dark) — driven by <html data-theme>. */
export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return DARK_THEMES.has(document.documentElement.dataset.theme || '');
}

let cachedTheme = '';
let cachedBg = '#ffffff';

/**
 * Page background color of the active theme, read from the CSS variable
 * (never hardcoded, so palette edits can't desync it). Cached per theme —
 * a dataset read is cheap, getComputedStyle runs only on theme switch.
 */
export function pageBackground(): string {
  if (typeof document === 'undefined') return '#ffffff';
  const t = document.documentElement.dataset.theme || '';
  if (t !== cachedTheme) {
    cachedTheme = t;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
    if (v) cachedBg = v;
  }
  return cachedBg;
}

/** Shared swatch palette for subjects and custom event colors. */
export const SUBJECT_COLORS = [
  { value: '#111111', label: 'Black' },
  { value: '#3f51b5', label: 'Indigo' },
  { value: '#00897b', label: 'Teal' },
  { value: '#d32f2f', label: 'Red' },
  { value: '#f57c00', label: 'Orange' },
  { value: '#7b1fa2', label: 'Purple' },
  { value: '#0277bd', label: 'Blue' },
  { value: '#2e7d32', label: 'Green' },
  { value: '#c2185b', label: 'Pink' },
  { value: '#5d4037', label: 'Brown' },
  { value: '#455a64', label: 'Blue Grey' },
  { value: '#00838f', label: 'Cyan' },
  { value: '#cddc39', label: 'Lime' },
  { value: '#8bc34a', label: 'Light Green' },
  { value: '#fdd835', label: 'Yellow' },
  { value: '#ffb300', label: 'Amber' },
  { value: '#f4511e', label: 'Deep Orange' },
  { value: '#ff8a65', label: 'Coral' },
  { value: '#ec407a', label: 'Rose' },
  { value: '#ce93d8', label: 'Lavender' },
  { value: '#5e35b1', label: 'Deep Purple' },
  { value: '#039be5', label: 'Sky Blue' },
  { value: '#4db6ac', label: 'Mint' },
  { value: '#9e9e9e', label: 'Grey' },
];

/** Default fill for custom events when the user picks no color. */
export const DEFAULT_CUSTOM_COLOR = '#888888';

interface ColoredEvent {
  subjectId: string;
  color?: string | null;
}

interface ColoredSubject {
  color: string;
}

/**
 * Fill color for an event block: a custom (subject-less) event uses its own
 * picked color; subject-bound events always use their subject's color.
 */
export function eventFillColor(
  event: ColoredEvent,
  subject?: ColoredSubject | null,
  fallback = '#888888'
): string {
  if (!event.subjectId && event.color) return event.color;
  return subject?.color || fallback;
}
