/**
 * A tiny bus for "the user asked to start a session" from somewhere that
 * cannot render the picker itself.
 *
 * The subject picker lives in the sidebar panel, but the F shortcut is handled
 * globally in the app shell. Rather than lifting the modal to the shell or
 * reaching into the card's state, the shortcut fires a request and the panel —
 * the one component that owns the picker — answers it.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const editListeners = new Set<Listener>();

/** Ask whatever is mounted to open the start-session flow. */
export function requestSessionStart(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeSessionStart(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Ask whatever is mounted to open the "change session start" editor. */
export function requestSessionStartEdit(): void {
  for (const fn of editListeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeSessionStartEdit(fn: Listener): () => void {
  editListeners.add(fn);
  return () => {
    editListeners.delete(fn);
  };
}
