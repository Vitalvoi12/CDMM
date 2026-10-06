import { useEffect } from 'react';

/**
 * One Escape key, one overlay closed.
 *
 * Every dialog in the app registers here on mount and is dismissed by the
 * shared listener, instead of each attaching its own handler. Doing it per
 * component did not survive two overlays being open at once: a page can hold
 * a quadrant list and a task form on top of it, and both document-level
 * listeners fired on the same keypress, closing both. A stack fixes that by
 * construction — only the topmost entry is ever consulted.
 *
 * The listener runs in the capture phase and stops propagation, so a dialog
 * that also binds Escape on its own element (or a component listening further
 * down) cannot react to the same press a second time. Keys other than Escape
 * are left completely alone.
 */

type Close = () => void;

/** Mount order = stacking order: the last overlay to mount is on top. */
const stack: Close[] = [];
let listening = false;

function topmost(): Close | undefined {
  return stack[stack.length - 1];
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const close = topmost();
  if (!close) return;
  // Claim the key before React's handlers and any other listener see it, so
  // exactly one overlay reacts.
  e.stopPropagation();
  e.preventDefault();
  close();
}

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', onKeyDown, true);
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('keydown', onKeyDown, true);
}

/**
 * Register an overlay for the lifetime of the component and return the
 * function that removes it again. Call it from an effect, passing the same
 * `onClose` the overlay is rendered with.
 */
export function pushOverlay(close: Close): () => void {
  stack.push(close);
  startListening();
  return () => {
    const i = stack.lastIndexOf(close);
    if (i !== -1) stack.splice(i, 1);
    if (stack.length === 0) stopListening();
  };
}

/**
 * Subscribe a mounted overlay to the shared Escape handling. Pass the same
 * `onClose` the overlay is rendered with.
 */
export function useEscapeOverlay(onClose: Close): void {
  useEffect(() => pushOverlay(onClose), [onClose]);
}

/**
 * Whether any overlay is currently open.
 *
 * The app shell used to answer this with `document.querySelector('.fixed
 * .inset-0')`, which guesses at the markup and only catches overlays built
 * that way. This asks the stack instead.
 */
export function hasOpenOverlay(): boolean {
  return stack.length > 0;
}