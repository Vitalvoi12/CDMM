import { useEffect, useRef, useState } from 'react';
import { subscribeCheckpoint, undoIfLatest } from '../../services/history';
import { keyLabel } from '../../services/shortcuts';
import { message } from '../mobile/UndoToast';

/** How long the toast offers Undo; a hover holds it. */
const SHOW_MS = 5000;
/** The slide-down on the way out (cdmm-toast-out). */
const OUT_MS = 220;

/**
 * The desktop undo toast: after anything is deleted (events, checklist tasks,
 * todos, subjects) it offers Undo for a few seconds, bottom centre. The
 * mouse over it holds it; Ctrl+Z, or any other action, dismisses it.
 */
export function DesktopUndoToast() {
  const [shown, setShown] = useState<{ label: string; entry: object; n: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () =>
      subscribeCheckpoint((label, entry) => {
        // Any other action replaces the toast — its Undo would revert that one.
        setLeaving(false);
        setShown((prev) => (label.startsWith('Delete ') ? { label, entry, n: (prev?.n ?? 0) + 1 } : null));
      }),
    []
  );

  // Counts down while the mouse is away; a fresh toast starts a fresh count.
  useEffect(() => {
    if (!shown || held) return;
    timer.current = window.setTimeout(() => setLeaving(true), SHOW_MS);
    return () => window.clearTimeout(timer.current);
  }, [shown, held]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
      setHeld(false);
    }, OUT_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  // Ctrl+Z undid it already (App's global handler); the toast has nothing left to offer.
  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) setLeaving(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      key={shown.n}
      role="status"
      className={`d-toast ${leaving ? 'out' : ''}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">delete</span>
      <span className="text-body text-on-surface truncate">{message(shown.label)}</span>
      <button
        type="button"
        className="ml-2 px-3 h-8 rounded-[0.45rem] text-control text-primary hover:bg-surface-container-highest transition-colors"
        onClick={() => {
          undoIfLatest(shown.entry);
          setLeaving(true);
        }}
      >
        Undo
      </button>
      <span className="flex gap-1" aria-hidden="true">
        {['Ctrl', 'KeyZ'].map((k) => (
          <span key={k} className="kbd kbd-sm">{keyLabel(k)}</span>
        ))}
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
        onClick={() => setLeaving(true)}
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      <span className="bar" style={{ animationDuration: `${SHOW_MS}ms`, animationPlayState: held ? 'paused' : 'running' }} />
    </div>
  );
}
