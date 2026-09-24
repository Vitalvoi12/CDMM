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
/** Muted, deepened pastels that sit well on the dark theme. */
const PASTEL_COLORS = [
  { value: '#b3778a', label: 'Rosewater' },
  { value: '#a86a7e', label: 'Dusty rose' },
  { value: '#ae7f6b', label: 'Nude peach' },
  { value: '#bd8f5a', label: 'Pastel apricot' },
  { value: '#b69a5f', label: 'Vanilla' },
  { value: '#949a55', label: 'Pale lime' },
  { value: '#7f9464', label: 'Pastel sage' },
  { value: '#6f8a74', label: 'Soft sage' },
  { value: '#6a9e86', label: 'Pastel mint' },
  { value: '#5f938a', label: 'Seafoam' },
  { value: '#5c8f9a', label: 'Powder teal' },
  { value: '#5d81a0', label: 'Dusty sky' },
  { value: '#6e90ad', label: 'Pastel sky' },
  { value: '#7887ab', label: 'Periwinkle mist' },
  { value: '#837eb2', label: 'Pastel periwinkle' },
  { value: '#8e7fb0', label: 'Pastel lavender' },
  { value: '#a0799f', label: 'Pastel lilac' },
  { value: '#9c7590', label: 'Pastel mauve' },
  { value: '#b08d6e', label: 'Pastel sand' },
  { value: '#948b80', label: 'Greige mist' },
  { value: '#7c8288', label: 'Slate gray' },
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
