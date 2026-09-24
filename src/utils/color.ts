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
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#211e19' : '#fdfcf8';
}

const DARK_THEMES = new Set(['dark']);

/** True on the dark theme — driven by <html data-theme>. */
export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return DARK_THEMES.has(document.documentElement.dataset.theme || '');
}

let cachedTheme = '';
let cachedBg = '#e2e2e2';

/**
 * Page background color of the active theme, read from the CSS variable
 * (never hardcoded, so palette edits can't desync it). Cached per theme —
 * a dataset read is cheap, getComputedStyle runs only on theme switch.
 */
export function pageBackground(): string {
  if (typeof document === 'undefined') return '#e2e2e2';
  const t = document.documentElement.dataset.theme || '';
  if (t !== cachedTheme) {
    cachedTheme = t;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
    if (v) cachedBg = v;
  }
  return cachedBg;
}

/** Palette swatches shared by subjects and custom event colors. */
/** Muted pastels that sit well on the grey theme. */
const PASTEL_COLORS = [
  { value: '#e5b8c2', label: 'Rosewater' },
  { value: '#dfaeb9', label: 'Dusty rose' },
  { value: '#e8c4b8', label: 'Nude peach' },
  { value: '#f0d3ac', label: 'Pastel apricot' },
  { value: '#ead9a8', label: 'Vanilla' },
  { value: '#d5d8a8', label: 'Pale lime' },
  { value: '#c2d1ac', label: 'Pastel sage' },
  { value: '#aec7b2', label: 'Soft sage' },
  { value: '#aed4c2', label: 'Pastel mint' },
  { value: '#a9cfc6', label: 'Seafoam' },
  { value: '#a9ccd4', label: 'Powder teal' },
  { value: '#a9c3d4', label: 'Dusty sky' },
  { value: '#b6cbe4', label: 'Pastel sky' },
  { value: '#bcc8e6', label: 'Periwinkle mist' },
  { value: '#c6c3e3', label: 'Pastel periwinkle' },
  { value: '#d0c6e6', label: 'Pastel lavender' },
  { value: '#d9c2dd', label: 'Pastel lilac' },
  { value: '#d9bccd', label: 'Pastel mauve' },
  { value: '#e0c9b4', label: 'Pastel sand' },
  { value: '#cfc6bd', label: 'Greige mist' },
];

/** Grouped swatches for the color pickers. */
export const SUBJECT_COLOR_GROUPS = [
  { label: 'Pastel', colors: PASTEL_COLORS },
];

/** Flat list (back-compat). */
export const SUBJECT_COLORS: { value: string; label: string }[] =
  SUBJECT_COLOR_GROUPS.flatMap((g) => g.colors);

/** Default fill for custom events when the user picks no color. */
export const DEFAULT_CUSTOM_COLOR = '#6e7e85';

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
  fallback = '#6e7e85'
): string {
  if (!event.subjectId && event.color) return event.color;
  return subject?.color || fallback;
}
