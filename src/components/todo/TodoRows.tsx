import type { TodoTask } from '../../types';
import { TodoCheckbox } from './TodoCheckbox';

/** Relative day label for a due date (mockup style). Times are not shown:
 *  stored due times are a fixed 18:00 placeholder, not real deadlines. */
export function formatDueLabel(iso: string | undefined, completed: boolean): string | null {
  if (!iso) return completed ? null : 'Someday';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (!completed && d.getTime() < Date.now() && diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isOverdue(task: TodoTask): boolean {
  return !!task.dueDate && !task.completed && new Date(task.dueDate).getTime() < Date.now();
}

function DueLabel({ task }: { task: TodoTask }) {
  const label = formatDueLabel(task.dueDate, task.completed);
  if (!label) return null;
  const overdue = isOverdue(task);
  return (
    <span
      className={`font-label-sm text-label-sm flex-shrink-0 uppercase tracking-[0.1em] ${
        overdue ? 'text-error' : 'text-on-surface-variant'
      }`}
    >
      {label}
    </span>
  );
}

export function CompactTodoRow({
  task,
  onToggle,
  onOpen,
}: {
  task: TodoTask;
  onToggle: (id: string, completed: boolean) => void;
  onOpen: (task: TodoTask) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 min-w-0 border border-outline-variant rounded-xl px-4 py-3 transition-colors hover:border-outline ${
        task.completed ? 'opacity-60' : ''
      }`}
    >
      <TodoCheckbox task={task} onToggle={onToggle} />
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          className={`font-body-md text-body-md truncate min-w-0 flex-1 ${
            task.completed ? 'line-through text-on-surface-variant' : 'text-on-surface'
          }`}
        >
          {task.title}
        </span>
        <DueLabel task={task} />
      </button>
    </div>
  );
}

export function FullTodoRow({
  task,
  onToggle,
  onOpen,
}: {
  task: TodoTask;
  onToggle: (id: string, completed: boolean) => void;
  onOpen: (task: TodoTask) => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div className={`flex items-start gap-3 py-3 border-b border-outline-variant last:border-b-0 ${task.completed ? 'opacity-60' : ''}`}>
      <div className="pt-0.5">
        <TodoCheckbox task={task} onToggle={onToggle} />
      </div>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex-1 min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          className={`font-body-md text-body-md break-words block ${
            task.completed ? 'line-through text-on-surface-variant' : 'text-on-surface font-medium'
          }`}
        >
          {task.title}
        </span>
        {task.description && (
          <span className="font-body-sm text-body-sm text-on-surface-variant mt-1 break-words block">
            {task.description}
          </span>
        )}
        {task.dueDate && (
          <span className={`font-label-sm text-label-sm inline-block mt-1 uppercase tracking-[0.1em] ${overdue ? 'text-error' : 'text-on-surface-variant'}`}>
            {formatDueLabel(task.dueDate, task.completed)}
          </span>
        )}
      </button>
    </div>
  );
}
