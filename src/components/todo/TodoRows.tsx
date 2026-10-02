import type { TodoTask } from '../../types';
import { dateKey, formatDuration } from '../../utils/time';
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

/** True when a task belongs on the "Urgent & Important" card for a given day. */
export function matchesUrgentImportant(task: TodoTask, day: string): boolean {
  return (
    !!task.important &&
    !!task.urgent &&
    !task.completed &&
    !!task.dueDate &&
    dateKey(new Date(task.dueDate)) === day
  );
}

/** Total estimate of the given tasks, in minutes (0 when none is estimated). */
export function totalEstMinutes(tasks: TodoTask[]): number {
  let sum = 0;
  for (const t of tasks) if (t.estMinutes && t.estMinutes > 0) sum += t.estMinutes;
  return sum;
}

/** "45m" chip shown next to the due label; nothing when unset. */
function EstLabel({ task }: { task: TodoTask }) {
  if (!task.estMinutes || task.estMinutes <= 0) return null;
  return (
    <span className="font-label-sm text-label-sm flex-shrink-0 uppercase tracking-[0.1em] text-on-surface-variant inline-flex items-center gap-1">
      <span className="material-symbols-outlined text-[12px] leading-none">timer</span>
      {formatDuration(task.estMinutes)}
    </span>
  );
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
        <EstLabel task={task} />
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
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          {task.estMinutes != null && task.estMinutes > 0 && (
            <span className="font-label-sm text-label-sm inline-flex items-center gap-1 uppercase tracking-[0.1em] text-on-surface-variant">
              <span className="material-symbols-outlined text-[12px] leading-none">timer</span>
              Est. {formatDuration(task.estMinutes)}
            </span>
          )}
          {task.dueDate && (
            <span className={`font-label-sm text-label-sm uppercase tracking-[0.1em] ${overdue ? 'text-error' : 'text-on-surface-variant'}`}>
              {formatDueLabel(task.dueDate, task.completed)}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
