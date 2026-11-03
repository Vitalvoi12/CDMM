/** Move keyboard focus within a visible group, preserving normal Tab navigation. */
export function focusSibling(current: HTMLElement, selector: string, step: number, root: ParentNode = document): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => el.getClientRects().length > 0);
  if (!items.length) return;
  const index = items.indexOf(current);
  const next = items[(index + step + items.length) % items.length];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
