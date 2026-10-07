import { useState } from 'react';
import { isIosPwa, notificationPermission, requestNotificationPermission } from '../../services/notifications';

/** When "Not now" was last pressed (ms); the prompt comes back after a week. */
const DISMISSED_KEY = 'cdmm.notifyPromptDismissed';
const REASK_MS = 7 * 86_400_000;

function shouldShow(): boolean {
  // iOS only offers notifications to the installed Home Screen app, and only
  // asks in response to a tap — so the app has to ask itself, with a button.
  if (!isIosPwa() || notificationPermission() !== 'default') return false;
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY)) || 0;
    return Date.now() - at > REASK_MS;
  } catch {
    return true;
  }
}

export function NotificationPrompt() {
  const [open, setOpen] = useState(shouldShow);
  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // storage unavailable — the prompt simply returns next launch
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Enable notifications"
      className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[90] mx-auto max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-elev-3 p-4 flex flex-col gap-3 animate-pop-in"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-primary leading-none mt-0.5">notifications</span>
        <div className="flex flex-col gap-1">
          <p className="font-label-md text-label-md text-on-surface uppercase tracking-[0.1em]">Event reminders</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Allow notifications so CDMM can remind you before your events start.
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={dismiss}
          className="flex-1 py-2.5 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant uppercase tracking-[0.1em]"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => {
            // Called straight from the tap, as iOS requires.
            void requestNotificationPermission().then(() => setOpen(false));
          }}
          className="flex-1 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-[0.1em]"
        >
          Allow
        </button>
      </div>
    </div>
  );
}
