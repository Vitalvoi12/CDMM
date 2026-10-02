import { useCallback, useMemo, useState } from 'react';
import type { TodoTask } from '../../types';
import { todoRepo } from '../../services/repositories';
import { checkpoint } from '../../services/history';
import { useSyncRefresh } from '../../hooks/useServerSync';
import { dateKey, formatDuration } from '../../utils/time';
import { TodoCheckbox } from './TodoCheckbox';
import { formatDueLabel, isOverdue, totalEstMinutes } from './TodoRows';

interface UrgentImportantCardProps {
  /** Opens the Todo page — the card itself is read-only apart from the checkbox. */
  onOpenTodo: () => void;
}

/**
 * The "Urgent & Important" quadrant of the Eisenhower matrix, narrowed to what
 * is on the clock today: incomplete tasks that are both important and urgent
 * AND whose due date is today. It answers "what has to happen today", so
 * anything without a deadline or due later is not the list's business.
 *
 * Same data as the Todo page, so it stays in step through sync.
 */
export function UrgentImportantCard({ onOpenTodo }: UrgentImportantCardProps) {
  const [todos, setTodos] = useState<TodoTask[]>(() => todoRepo.getAll());

  // Seeded from the repository, so only the sync bus has to tell us about
  // changes made on another device.
  const refresh = useCallback(() => setTodos(todoRepo.getAll()), []);
  useSyncRefresh(refresh);

  const priority = useMemo(() => {
    const today = dateKey(new Date());
    return todos
      .filter(
        (t) =>
          t.important &&
          t.urgent &&
          !t.completed &&
          !!t.dueDate &&
          dateKey(new Date(t.dueDate)) === today
      )
      .sort((a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime());
  }, [todos]);

  const est = useMemo(() => totalEstMinutes(priority), [priority]);

  const handleToggle = useCallback(
    (id: string, completed: boolean) => {
      checkpoint(completed ? 'Complete task' : 'Reopen task');
      todoRepo.update(id, { completed });
      refresh();
    },
    [refresh]
  );

  return (
    <section
      aria-label="Urgent and important tasks due today"
      className="bg-surface-container-lowest rounded-2xl shadow-elev-1 p-6 max-lg:p-4 flex flex-col min-h-0"
    >
      <div className="flex items-baseline justify-between gap-3 mb-4 max-lg:mb-2">
        <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
          Urgent &amp; Important
        </h2>
        <span className="flex items-center gap-2 flex-shrink-0">
          {est > 0 && (
            <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant/70 tabular-nums inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] leading-none">timer</span>
              {formatDuration(est)}
            </span>
          )}
          <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums">
            {priority.length}
          </span>
        </span>
      </div>

      {priority.length === 0 ? (
        <p className="font-body-sm text-body-sm max-lg:!text-[9px] text-on-surface-variant">
          Nothing urgent and important due today
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 max-lg:gap-1.5 overflow-y-auto min-h-0">
          {priority.map((task) => {
            const due = formatDueLabel(task.dueDate, task.completed);
            const overdue = isOverdue(task);
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={onOpenTodo}
                  title="Open in Todo"
                  className="w-full flex items-center gap-3 max-lg:gap-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <TodoCheckbox task={task} onToggle={handleToggle} />
                  <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface truncate min-w-0 flex-1">
                    {task.title}
                  </span>
                  {task.estMinutes != null && task.estMinutes > 0 && (
                    <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant/70 tabular-nums flex-shrink-0">
                      {formatDuration(task.estMinutes)}
                    </span>
                  )}
                  {due && (
                    <span
                      className={`font-label-sm text-label-sm max-lg:!text-[8px] uppercase tracking-[0.1em] flex-shrink-0 ${
                        overdue ? 'text-error' : 'text-on-surface-variant'
                      }`}
                    >
                      {due}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
