import { useEffect, useRef, useState } from 'react';
import type { TodoReminder, TodoTask } from '../../types';
import { useEscapeOverlay } from '../../services/overlays';
import { formatDuration } from '../../utils/time';
import { Toggle } from '../common/Toggle';
import { NotifyList, toDateTimeValue, type NotifyItem } from '../common/NotifyList';

interface TodoFormProps {
  task: TodoTask | null;
  defaults: { important: boolean; urgent: boolean };
  onSave: (data: {
    title: string;
    description?: string;
    important: boolean;
    urgent: boolean;
    dueDate?: string;
    /** False when only a day was picked (the stored time is then 18:00). */
    dueHasTime: boolean;
    estMinutes?: number;
    /** Reminder moments; [] clears them. */
    reminders: TodoReminder[];
  }) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
}

function toInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** What preset leads count back from: the due time, or 9:00 on the due day. */
function dueAnchor(dueDate: string, dueTime: string): Date | null {
  if (!dueDate) return null;
  const anchor = new Date(`${dueDate}T${dueTime || '09:00'}`);
  return Number.isFinite(anchor.getTime()) ? anchor : null;
}

/** When a row fires: its custom moment, else its lead before the anchor. */
function reminderMoment(anchor: Date | null, item: NotifyItem): Date | null {
  if (item.customAt) return new Date(item.customAt);
  if (!anchor || item.lead === null) return null;
  return new Date(anchor.getTime() - item.lead * 60_000);
}

export function TodoForm({ task, defaults, onSave, onDelete, onCancel }: TodoFormProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [important, setImportant] = useState(task?.important ?? defaults.important);
  const [urgent, setUrgent] = useState(task?.urgent ?? defaults.urgent);
  // A new task is due today unless another day is picked.
  const [dueDate, setDueDate] = useState(() =>
    task ? toInputValue(task.dueDate) : toInputValue(new Date().toISOString())
  );
  const [dueTime, setDueTime] = useState(() => {
    if (!task?.dueDate || !task.dueHasTime) return '';
    return toDateTimeValue(new Date(task.dueDate)).slice(11);
  });
  const [estInput, setEstInput] = useState(task?.estMinutes ? String(task.estMinutes) : '');
  // A custom reminder is stored as a moment with no lead.
  const [notifyItems, setNotifyItems] = useState<NotifyItem[]>(() =>
    (task?.reminders ?? []).map((r) =>
      r.lead != null ? { lead: r.lead, customAt: '' } : { lead: null, customAt: toDateTimeValue(new Date(r.at)) },
    ),
  );
  const anchor = dueAnchor(dueDate, dueTime);
  const moments = notifyItems.map((item) => reminderMoment(anchor, item));
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEscapeOverlay(onCancel);

  useEffect(() => {
    if (task) {
      // Edit mode: focus the dialog itself so Enter/Delete work right away;
      // click into a field to edit text. Escape is the overlay stack's job.
      dialogRef.current?.focus({ preventScroll: true });
    } else {
      titleRef.current?.focus();
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (urgent && !dueDate) {
      setError('Set date');
      return;
    }
    // Empty / non-numeric / zero clears the estimate rather than storing 0.
    const parsedEst = Number.parseInt(estInput, 10);
    const estMinutes = Number.isFinite(parsedEst) && parsedEst > 0 ? parsedEst : undefined;
    onSave({
      title: trimmed,
      description: description.trim() || undefined,
      important,
      urgent,
      dueDate: dueDate ? new Date(`${dueDate}T${dueTime || '18:00'}:00`).toISOString() : undefined,
      dueHasTime: !!(dueDate && dueTime),
      estMinutes,
      reminders: notifyItems.flatMap((item, i) => {
        const at = moments[i];
        if (!at || !Number.isFinite(at.getTime())) return [];
        return [item.customAt ? { at: at.toISOString() } : { at: at.toISOString(), lead: item.lead! }];
      }),
    });
  };

  // Escape is handled centrally by the overlay stack, so this only has Enter
  // and Delete. See services/overlays.ts.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (!(e.target instanceof HTMLTextAreaElement) || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      formRef.current?.requestSubmit();
    } else if (
      e.key === 'Delete' &&
      task &&
      onDelete &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target instanceof HTMLSelectElement)
    ) {
      // Delete key removes the task only in edit mode and only when not
      // typing in a field (there Delete edits text as usual).
      e.preventDefault();
      e.stopPropagation();
      onDelete(task.id);
    }
  };

  return (
    <div
      className="overlay-root z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit task' : 'New task'}
        className="bg-surface-container-lowest rounded-2xl p-6 shadow-elev-3 w-full max-w-lg max-h-full overflow-y-auto focus:outline-none animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
          {task ? 'Edit Task' : 'New Task'}
        </h2>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="todo-title" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
              Title
            </label>
            <input
              id="todo-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="todo-desc" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
              Description
            </label>
            <textarea
              id="todo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              rows={3}
              className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors resize-none placeholder:text-on-surface-variant/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Important" checked={important} onChange={setImportant} />
            <Toggle
              label="Urgent"
              checked={urgent}
              onChange={(v) => {
                setUrgent(v);
                if (!v) setError(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
              <div className="flex flex-col gap-2 min-w-0">
                <label htmlFor="todo-due" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
                  Due Date{urgent && <span className="text-error"> *</span>}
                </label>
                <input
                  id="todo-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    if (e.target.value) setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  className={`w-full min-w-0 bg-surface-container-low border rounded-xl py-2.5 px-4 max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors ${error ? 'border-error focus:border-error' : 'border-outline-variant focus:border-primary'}`}
                />
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="todo-time" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
                    Time
                  </label>
                  {dueTime && (
                    <button
                      type="button"
                      onClick={() => setDueTime('')}
                      className="font-label-sm text-label-sm text-primary uppercase tracking-[0.1em]"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="todo-time"
                  type="time"
                  value={dueTime}
                  disabled={!dueDate}
                  // iOS "Reset" empties the field, which simply means no time.
                  onChange={(e) => setDueTime(e.target.value)}
                  title={dueDate ? undefined : 'Pick a due date first'}
                  className="w-full min-w-0 bg-surface-container-low border rounded-xl py-2.5 px-4 max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors border-outline-variant focus:border-primary disabled:opacity-40"
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="font-body-sm text-body-sm text-error">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <label htmlFor="todo-est" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]">
              Est. Time
            </label>
            <input
              id="todo-est"
              type="number"
              inputMode="numeric"
              min={5}
              step={5}
              max={1440}
              value={estInput}
              onChange={(e) => setEstInput(e.target.value)}
              placeholder="e.g. 45"
              className="w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
            />
            {estHint(estInput) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">{estHint(estInput)}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <NotifyList
              items={notifyItems}
              onChange={setNotifyItems}
              anchor={anchor}
              zeroLabel="At due time"
              noAnchorHint="No due date — pick a custom time, or set a due date for the other options."
            />
            {dueDate && !dueTime && notifyItems.some((item) => !item.customAt) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">No time set — counts from 9:00 on the due day.</p>
            )}
            {moments.some((m) => m !== null && m.getTime() <= Date.now()) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {moments.length > 1 ? 'Some of these times have passed — those will not show.' : 'This time has passed — the reminder will not show.'}
              </p>
            )}
          </div>
          <div className="flex gap-3 mt-1">
            {task && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="px-4 py-2.5 bg-error-container text-on-error-container rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
            >
              {task ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Live readout of the estimate, so "90" reads as 1h 30m instead of a bare number. */
function estHint(raw: string): string | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatDuration(n);
}
