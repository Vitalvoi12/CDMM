/**
 * CSS `zoom` applied to <body> (banani density: 0.85 on desktop ≥1024px,
 * 1 elsewhere/mobile).
 *
 * PointerEvent client coords are visual px, while all calendar layout math
 * (HOUR_HEIGHT, style tops, offsetTop, min/maxDelta) is layout px. Divide
 * raw pointer deltas by this before converting to minutes, otherwise every
 * drag/resize/tap overshoots by 1/zoom on desktop.
 */
export function bodyZoom(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
  const z = parseFloat(getComputedStyle(document.body).zoom);
  return Number.isFinite(z) && z > 0 && z <= 4 ? z : 1;
}
