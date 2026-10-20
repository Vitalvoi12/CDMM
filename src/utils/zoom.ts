/**
 * CSS `zoom` applied to <body>: --app-zoom, 0.88 on phones (<1024px) and 1 on
 * desktop, times the interface size setting (hooks/useUiScale.ts).
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
