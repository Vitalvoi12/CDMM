/**
 * The CDMM Android app loads this site in a WebView and exposes
 * `window.CDMMAndroid`. The native side keeps its own copy of the session so
 * widgets and alarms work while the WebView is closed, and it
 * refreshes them whenever the web app reports a change.
 */
interface CdmmAndroid {
  setSession(token: string, username: string): void;
  clearSession(): void;
  dataChanged(): void;
}

function bridge(): CdmmAndroid | null {
  return (window as Window & { CDMMAndroid?: CdmmAndroid }).CDMMAndroid ?? null;
}

/** Running inside the Android app. */
export function isAndroidApp(): boolean {
  return bridge() !== null;
}

export function nativeSetSession(token: string, username: string): void {
  try {
    bridge()?.setSession(token, username);
  } catch {
    // older app without the method
  }
}

export function nativeClearSession(): void {
  try {
    bridge()?.clearSession();
  } catch {
    // ignore
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Tell the app its widgets and alarms are stale. Debounced: syncs come in bursts. */
export function nativeDataChanged(): void {
  if (!bridge() || pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      bridge()?.dataChanged();
    } catch {
      // ignore
    }
  }, 1500);
}
