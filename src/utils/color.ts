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
let cachedBg = '#f4f1ea';

/**
 * Page background color of the active theme, read from the CSS variable
 * (never hardcoded, so palette edits can't desync it). Cached per theme —
 * a dataset read is cheap, getComputedStyle runs only on theme switch.
 */
export function pageBackground(): string {
  if (typeof document === 'undefined') return '#f4f1ea';
  const t = document.documentElement.dataset.theme || '';
  if (t !== cachedTheme) {
    cachedTheme = t;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
    if (v) cachedBg = v;
  }
  return cachedBg;
}

/** Palette swatches shared by subjects and custom event colors. */
/** Warm, muted tones that sit well on the near-black warm dark theme. */
const PASTEL_COLORS = [
  { value: '#E9826A', label: 'Coral' },
  { value: '#D16A4E', label: 'Terracotta' },
  { value: '#E0975A', label: 'Apricot' },
  { value: '#D9A45B', label: 'Honey' },
  { value: '#C2A154', label: 'Goldenrod' },
  { value: '#A9713F', label: 'Ochre' },
  { value: '#A8A15C', label: 'Olive' },
  { value: '#8E9A55', label: 'Pale lime' },
  { value: '#7F9464', label: 'Sage' },
  { value: '#6A9E86', label: 'Eucalyptus' },
  { value: '#8FD3B5', label: 'Mint' },
  { value: '#5F938A', label: 'Seafoam' },
  { value: '#5C8F9A', label: 'Teal' },
  { value: '#5D81A0', label: 'Dusty sky' },
  { value: '#7887AB', label: 'Periwinkle mist' },
  { value: '#4F6E8C', label: 'Deep sea' },
  { value: '#8E7FB0', label: 'Lavender' },
  { value: '#A0799F', label: 'Lilac' },
  { value: '#B3778A', label: 'Rosewater' },
  { value: '#B08D6E', label: 'Sand' },
  { value: '#8A857C', label: 'Taupe' },
];

/** Grouped swatches for the color pickers. */
export const SUBJECT_COLOR_GROUPS = [
  { label: 'Ember', colors: PASTEL_COLORS },
];

/** Flat list (back-compat). */
export const SUBJECT_COLORS: { value: string; label: string }[] =
  SUBJECT_COLOR_GROUPS.flatMap((g) => g.colors);

/** Default fill for custom events when the user picks no color. */
export const DEFAULT_CUSTOM_COLOR = '#8A857C';

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
  fallback = '#8A857C'
): string {
  if (!event.subjectId && event.color) return event.color;
  return subject?.color || fallback;
}
