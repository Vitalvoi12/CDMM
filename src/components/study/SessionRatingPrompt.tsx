import { useEffect, useRef, useState } from 'react';
import { useEscapeOverlay } from '../../services/overlays';
import { FOCUS_LABELS, type FocusRating } from '../../utils/analytics';

interface SessionRatingPromptProps {
  subjectName: string;
  /** Recorded focus time, minutes. */
  minutes: number;
  onRate: (rating: FocusRating, note: string) => void;
  onSkip: () => void;
}

const OPTIONS: { rating: FocusRating; icon: string }[] = [
  { rating: 1, icon: 'blur_on' },
  { rating: 2, icon: 'adjust' },
  { rating: 3, icon: 'target' },
];

/**
 * "How was your focus?" — shown right after a session is saved. One tap on a
 * rating stores it (with the note, if one was typed) and closes the window;
 * Skip / Escape leaves the session unrated. Keys 1–3 rate on a keyboard while
 * the note field is not focused.
 */
export function SessionRatingPrompt({ subjectName, minutes, onRate, onSkip }: SessionRatingPromptProps) {
  const [note, setNote] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEscapeOverlay(onSkip);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  const rate = (rating: FocusRating) => onRate(rating, note.trim());

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      rate(Number(e.key) as FocusRating);
    }
  };

  return (
    <div className="overlay-root z-[110] flex items-center justify-center bg-scrim p-4 animate-fade-in" onClick={onSkip}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rate your focus"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:p-5 shadow-elev-3 w-full max-w-md max-h-full overflow-y-auto animate-pop-in outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-1">How was your focus?</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-5">
          {subjectName} · {minutes} min saved
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4" role="group" aria-label="Focus quality">
          {OPTIONS.map(({ rating, icon }) => (
            <button
              key={rating}
              type="button"
              onClick={() => rate(rating)}
              title={`${FOCUS_LABELS[rating]} (${rating})`}
              className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border border-outline-variant bg-surface-container-low hover:border-primary hover:bg-secondary-container hover:text-on-secondary-container text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="material-symbols-outlined text-[26px] leading-none">{icon}</span>
              <span className="font-label-md text-label-md uppercase tracking-[0.12em]">{FOCUS_LABELS[rating]}</span>
              <span className="max-lg:hidden font-label-sm text-[10px] text-on-surface-variant tabular-nums">{rating}</span>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — then tap a rating"
          aria-label="Session note"
          // 16px on the phone: iOS zooms into smaller fields on focus.
          className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 font-body-md text-body-md max-lg:!text-[16px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 mb-3"
        />

        <button
          type="button"
          onClick={onSkip}
          className="w-full py-2 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
