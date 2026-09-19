import { useEffect, useRef } from 'react';

export type RecurrenceScope = 'single' | 'following';

interface RecurrenceScopeDialogProps {
  mode: 'edit' | 'delete';
  /** Total events in the series (including this one). */
  totalCount: number;
  /** Events this choice would affect excluding this one (following only). */
  followingCount: number;
  onPick: (scope: RecurrenceScope) => void;
  onCancel: () => void;
}

export function RecurrenceScopeDialog({ mode, totalCount, followingCount, onPick, onCancel }: RecurrenceScopeDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-scrim p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'edit' ? 'Edit recurring event' : 'Delete recurring event'}
        className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-xl w-full max-w-md focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
          {mode === 'edit' ? 'Edit recurring event' : 'Delete recurring event'}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">
          This event repeats ({totalCount} in series). Apply to just this event or to this and all following events?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onPick('single')}
            className="w-full py-2 border border-outline-variant rounded font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors uppercase tracking-widest"
          >
            Only this event
          </button>
          <button
            type="button"
            onClick={() => onPick('following')}
            className="w-full py-2 bg-primary text-on-primary rounded font-label-md text-label-md uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            This and following{followingCount > 0 ? ` (${followingCount + 1})` : ''}
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
