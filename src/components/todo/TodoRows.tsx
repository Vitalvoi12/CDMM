import type { TodoTask } from '../../types';
import { TodoCheckbox } from './TodoCheckbox';

function formatDue(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diff < 0) return `${label} · overdue`;
  if (diff === 0) return `${label} · today`;
  if (diff === 1) return `${label} · tomorrow`;
  return label;
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
  const overdue = !!task.dueDate && !task.completed && new Date(task.dueDate).getTime() < Date.now();
  return (
    <div className="flex items-center gap-2 min-w-0 group/row">
      <TodoCheckbox task={task} onToggle={onToggle} />
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex items-center gap-2 min-w-0 flex-1 text-left py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          className={`font-body-sm text-body-sm truncate min-w-0 ${
            task.completed ? 'line-through text-on-surface-variant' : 'text-on-surface'
          }`}
        >
          {task.title}
        </span>
        {task.dueDate && !task.completed && (
          <span className={`font-label-sm text-label-sm flex-shrink-0 ml-auto ${overdue ? 'text-error' : 'text-on-surface-variant'}`}>
            {formatDue(task.dueDate)}
          </span>
        )}
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
  const overdue = !!task.dueDate && !task.completed && new Date(task.dueDate).getTime() < Date.now();
  return (
    <div className="flex items-start gap-3 py-3 border-b border-outline-variant last:border-b-0 group/row">
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
          <span className={`font-label-sm text-label-sm inline-block mt-1 ${overdue ? 'text-error' : 'text-on-surface-variant'}`}>
            Due {new Date(task.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </button>
    </div>
  );
}
