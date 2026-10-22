import { useEffect, useRef, useState } from 'react';
import { subscribeCheckpoint, undoIfLatest } from '../../services/history';

/** How long the toast offers Undo. */
const SHOW_MS = 5000;
/** The slide-down on the way out (cdmm-toast-out). */
const OUT_MS = 220;
/** A swipe settles (flies off or springs back) in this long. */
const FLING_MS = 180;
const DECIDE_PX = 8;

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
 * A sideways swipe either way flings it off screen.
 */
export function UndoToast() {
  const [shown, setShown] = useState<{ label: string; entry: object; n: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);
  // The swipe in progress; `expired` = the show time ran out mid-drag.
  const drag = useRef<{ x: number; y: number; dx: number; t: number; v: number; mode: 'none' | 'h' | 'v' } | null>(null);
  const expired = useRef(false);

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
    expired.current = false;
    const timer = window.setTimeout(() => {
      // Not under the finger: the drag's release decides then.
      if (drag.current?.mode === 'h') expired.current = true;
      else setLeaving(true);
    }, SHOW_MS);
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

  // The drag is written straight to the DOM, like SwipeRow.
  const place = (x: number, ms: number) => {
    const el = toastRef.current;
    if (!el) return;
    const w = el.offsetWidth || 1;
    el.style.transition = ms ? `transform ${ms}ms ease-out, opacity ${ms}ms ease-out` : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
    el.style.opacity = x ? String(Math.max(0, 1 - Math.abs(x) / w)) : '';
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1 || leaving) return;
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, dx: 0, t: e.timeStamp, v: 0, mode: 'none' };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    // Screen px → layout px: the phone UI is zoomed.
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const dx = (t.clientX - d.x) / zoom;
    const dy = (t.clientY - d.y) / zoom;
    if (d.mode === 'none') {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      d.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      // Stop the slide-in, so it can't override the drag's transform.
      if (d.mode === 'h' && toastRef.current) toastRef.current.style.animation = 'none';
    }
    if (d.mode !== 'h') return;
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = (dx - d.dx) / dt;
    d.dx = dx;
    d.t = e.timeStamp;
    place(dx, 0);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== 'h') return;
    const w = toastRef.current?.offsetWidth ?? 300;
    // Far enough, or flicked: off it goes, the way it was swiped.
    if (Math.abs(d.dx) > w * 0.35 || (Math.abs(d.v) > 0.4 && Math.sign(d.v) === Math.sign(d.dx))) {
      place(Math.sign(d.dx) * (w + 32), FLING_MS);
      const n = shown?.n;
      window.setTimeout(() => setShown((cur) => (cur?.n === n ? null : cur)), FLING_MS);
      return;
    }
    place(0, FLING_MS);
    if (expired.current) setLeaving(true);
  };

  if (!shown) return null;
  return (
    <div
      key={shown.n}
      ref={toastRef}
      className={`m-toast undo z-40 ${leaving ? 'out' : ''}`}
      role="status"
      style={{ bottom: 8, touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
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
