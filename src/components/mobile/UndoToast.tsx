import { useEffect, useState } from 'react';
import { subscribeCheckpoint, undoIfLatest } from '../../services/history';

/** How long the toast offers Undo. */
const SHOW_MS = 5000;
/** The slide-down on the way out (cdmm-toast-out). */
const OUT_MS = 220;

/** Actions easy to do by a stray tap or swipe: deleting, checking off, postponing. */
const UNDOABLE = /^(Delete|Complete|Move checklist task) /;

/** "Delete 3 events" → "3 events deleted"; "Complete checklist task" → "Task done"; "Move checklist task to Oct 23" → "Task moved to Oct 23". */
function message(label: string): string {
  if (label.startsWith('Move checklist task ')) return `Task moved ${label.slice('Move checklist task '.length)}`;
  const [, verb, what] = /^(\w+) (.*)$/.exec(label)!;
  const thing = what.replace(/^task$/, 'todo').replace('checklist task', 'task');
  return `${thing[0].toUpperCase()}${thing.slice(1)} ${verb === 'Delete' ? 'deleted' : 'done'}`;
}

/**
 * The phone's undo toast: after a delete or a check-off (checklist task,
 * todo; deleting an event) it offers Undo for a few seconds, above the session dock.
 */
export function UndoToast() {
  const [shown, setShown] = useState<{ label: string; entry: object; n: number } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(
    () =>
      subscribeCheckpoint((label, entry) => {
        // Any other action replaces the toast — its Undo would revert that one.
        setLeaving(false);
        setShown((prev) => (UNDOABLE.test(label) ? { label, entry, n: (prev?.n ?? 0) + 1 } : null));
      }),
    []
  );

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setLeaving(true), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!shown) return null;
  return (
    <div key={shown.n} className={`m-toast undo z-40 ${leaving ? 'out' : ''}`} role="status" style={{ bottom: 8 }}>
      <span className="material-symbols-outlined m-ic s m-mut">{shown.label.startsWith('Delete') ? 'delete' : shown.label.startsWith('Move') ? 'redo' : 'check_circle'}</span>
      <span className="flex-1 min-w-0 m-tr truncate">{message(shown.label)}</span>
      <button
        type="button"
        className="m-btn"
        onClick={() => {
          undoIfLatest(shown.entry);
          setLeaving(true);
        }}
      >
        Undo
      </button>
      <span className="bar" style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  );
}
