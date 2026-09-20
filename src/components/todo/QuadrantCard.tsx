import { forwardRef, useMemo } from 'react';
import type { TodoTask } from '../../types';
import { CompactTodoRow } from './TodoRows';

interface QuadrantCardProps {
  title: string;
  tasks: TodoTask[];
  onToggle: (id: string, completed: boolean) => void;
  onOpenTask: (task: TodoTask) => void;
  onOpenQuadrant: () => void;
  onAdd: () => void;
}

export const QuadrantCard = forwardRef<HTMLButtonElement, QuadrantCardProps>(function QuadrantCard(
  { title, tasks, onToggle, onOpenTask, onOpenQuadrant, onAdd },
  ref
) {
  const active = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const visible = active;

  return (
    <section
      aria-label={title}
      className="relative bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 pt-5 px-5 pb-5 flex flex-col min-w-0 h-full min-h-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          ref={ref}
          type="button"
          onClick={onOpenQuadrant}
          className="flex items-center gap-3 min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary group"
        >
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-[0.14em] truncate">
            {title}
          </h2>
          <span className="font-label-sm text-label-sm text-on-surface-variant flex-shrink-0 tabular-nums">
            {active.length}
          </span>
          <span className="material-symbols-outlined text-[13px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            open_in_full
          </span>
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add task to ${title}`}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
        </button>
      </div>

      {active.length === 0 ? (
        <button
          type="button"
          onClick={onOpenQuadrant}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-6 text-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="material-symbols-outlined text-[19px] text-on-surface-variant opacity-60">task_alt</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">Nothing here</span>
        </button>
      ) : (
        <div className="relative overflow-y-auto flex flex-col gap-2 min-h-0 flex-1">
          {visible.map((task) => (
            <CompactTodoRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onOpen={onOpenTask}
            />
          ))}
        </div>
      )}
    </section>
  );
});
