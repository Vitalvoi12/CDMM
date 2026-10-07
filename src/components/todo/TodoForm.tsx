import { useEffect, useRef, useState } from 'react';
import type { TodoTask } from '../../types';
import { useEscapeOverlay } from '../../services/overlays';
import { formatDuration } from '../../utils/time';
import { Toggle } from '../common/Toggle';

interface TodoFormProps {
  task: TodoTask | null;
  defaults: { important: boolean; urgent: boolean };
  onSave: (data: {
    title: string;
    description?: string;
    important: boolean;
    urgent: boolean;
    dueDate?: string;
    estMinutes?: number;
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

export function TodoForm({ task, defaults, onSave, onDelete, onCancel }: TodoFormProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [important, setImportant] = useState(task?.important ?? defaults.important);
  const [urgent, setUrgent] = useState(task?.urgent ?? defaults.urgent);
  const [dueDate, setDueDate] = useState(toInputValue(task?.dueDate));
  const [estInput, setEstInput] = useState(task?.estMinutes ? String(task.estMinutes) : '');
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
      dueDate: dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : undefined,
      estMinutes,
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit task' : 'New task'}
        className="bg-surface-container-lowest rounded-2xl p-6 shadow-elev-3 w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none animate-pop-in"
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
          <div className="grid grid-cols-1 gap-3 min-[481px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] min-[481px]:gap-2">
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
