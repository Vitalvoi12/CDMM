/**
 * How a stats block frames itself: `section` is the phone's open heading with
 * boxes underneath; `card` is the desktop grid's single card, heading inside.
 */
export type StatLayout = 'section' | 'card';

/**
 * The inner box of a section: a framed panel on the phone, nothing extra
 * inside a desktop card (no card in a card).
 */
export function boxClass(layout: StatLayout, inner: string): string {
  return layout === 'card'
    ? inner
    : `rounded-2xl border border-outline-variant bg-surface-container shadow-elev-1 p-5 ${inner}`;
}
