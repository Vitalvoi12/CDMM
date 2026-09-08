import { useEffect, useRef, useState } from 'react';
import type { TodoTask } from '../../types';
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
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({
      title: trimmed,
      description: description.trim() || undefined,
      important,
      urgent,
      dueDate: dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit task' : 'New task'}
        className="bg-surface-container-lowest rounded-xl p-6 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
          {task ? 'Edit Task' : 'New Task'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="todo-title" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Title
            </label>
            <input
              id="todo-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="todo-desc" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Description
            </label>
            <textarea
              id="todo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              rows={3}
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Important" checked={important} onChange={setImportant} />
            <Toggle label="Urgent" checked={urgent} onChange={setUrgent} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="todo-due" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Due Date
            </label>
            <input
              id="todo-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
            />
          </div>
          <div className="flex gap-4 mt-2">
            {task && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="px-4 py-2 bg-error-container text-on-error-container rounded font-label-md text-label-md uppercase tracking-widest hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 border border-outline-variant rounded font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-primary text-on-primary rounded font-label-md text-label-md uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              {task ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
