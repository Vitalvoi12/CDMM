import { useEffect, useRef } from 'react';
import { formatTimerDuration } from '../../utils/time';
import { useEscapeOverlay } from '../../services/overlays';

interface SessionFinishConfirmProps {
  subjectName: string;
  /** Focus ms so far, shown so the user sees what will be recorded. */
  elapsed: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "End this session?" — asked when F is pressed while a session runs, so a
 * stray keypress cannot close the session by accident. The confirm button is
 * focused on open: Enter ends the session, Escape keeps it running.
 */
export function SessionFinishConfirm({ subjectName, elapsed, onConfirm, onCancel }: SessionFinishConfirmProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEscapeOverlay(onCancel);

  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="overlay-root z-[110] flex items-center justify-center bg-scrim p-4 animate-fade-in" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-label="End session"
        className="bg-surface-container-lowest rounded-2xl p-6 shadow-elev-3 w-full max-w-md max-h-full overflow-y-auto animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">End session?</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">
          Are you sure you want to end the {subjectName} session? {formatTimerDuration(elapsed)} will be saved to the calendar.
        </p>

        <div className="flex flex-col gap-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="w-full py-2 rounded-full bg-error-container text-on-error-container font-label-md text-label-md uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            End session
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
