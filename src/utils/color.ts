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
