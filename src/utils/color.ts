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
let cachedBg = '#f6f1e6';

/**
 * Page background color of the active theme, read from the CSS variable
 * (never hardcoded, so palette edits can't desync it). Cached per theme —
 * a dataset read is cheap, getComputedStyle runs only on theme switch.
 */
export function pageBackground(): string {
  if (typeof document === 'undefined') return '#f6f1e6';
  const t = document.documentElement.dataset.theme || '';
  if (t !== cachedTheme) {
    cachedTheme = t;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
    if (v) cachedBg = v;
  }
  return cachedBg;
}

/** Palette swatches shared by subjects and custom event colors. */
/** Primary brand accents — used for key subjects, custom events, and CTAs. */
export const SUBJECT_COLORS = [
  { value: '#bf8f24', label: 'Amber' },
  { value: '#d9a539', label: 'Honey' },
  { value: '#4e7d72', label: 'Teal' },
  { value: '#63948a', label: 'Muted teal' },
  { value: '#647d5f', label: 'Sage' },
  { value: '#bc4f48', label: 'Clay' },
  { value: '#d86a63', label: 'Muted clay' },
  { value: '#8a6b22', label: 'Bronze' },
  { value: '#b3a98f', label: 'Sand' },
  { value: '#6d6759', label: 'Stone' },
  { value: '#9b7b4f', label: 'Ochre' },
  { value: '#718c70', label: 'Olive' },
  { value: '#527a75', label: 'Pine' },
  { value: '#9b8f67', label: 'Moss gold' },
  { value: '#a4785f', label: 'Dusty clay' },
  { value: '#7e8b91', label: 'Slate' },
  { value: '#8e6f78', label: 'Mauve' },
  { value: '#b38a5a', label: 'Caramel' },
  { value: '#6f7f5f', label: 'Moss' },
  { value: '#96775f', label: 'Walnut' },
];

/** Default fill for custom events when the user picks no color. */
export const DEFAULT_CUSTOM_COLOR = '#b3a98f';

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
  fallback = '#b3a98f'
): string {
  if (!event.subjectId && event.color) return event.color;
  return subject?.color || fallback;
}
