import { forwardRef, useMemo, useState } from 'react';
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

const COLLAPSED_MAX = 'max-lg:max-h-36 lg:max-h-56';

export const QuadrantCard = forwardRef<HTMLButtonElement, QuadrantCardProps>(function QuadrantCard(
  { title, tasks, onToggle, onOpenTask, onOpenQuadrant, onAdd },
  ref
) {
  const [editingInside, setEditingInside] = useState(false);
  const active = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const visible = editingInside ? active : active.slice(0, 6);
  const overflow = active.length - visible.length;

  return (
    <section
      aria-label={title}
      className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 flex flex-col min-w-0 hover:border-outline transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          ref={ref}
          type="button"
          onClick={onOpenQuadrant}
          className="flex items-center gap-2 min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary group"
        >
          <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest truncate">
            {title}
          </h2>
          <span className="font-label-sm text-label-sm text-on-surface-variant flex-shrink-0 tabular-nums">
            {active.length}
          </span>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            open_in_full
          </span>
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add task to ${title}`}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-on-surface flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
      </div>

      {active.length === 0 ? (
        <button
          type="button"
          onClick={onOpenQuadrant}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-6 text-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="material-symbols-outlined text-[24px] text-on-surface-variant opacity-60">task_alt</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">Nothing here</span>
        </button>
      ) : (
        <div
          className={`relative overflow-hidden flex flex-col gap-0.5 ${editingInside ? '' : COLLAPSED_MAX}`}
          onMouseEnter={() => setEditingInside(true)}
          onMouseLeave={() => setEditingInside(false)}
        >
          {visible.map((task) => (
            <CompactTodoRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onOpen={onOpenTask}
            />
          ))}
          {!editingInside && overflow > 0 && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface-container-lowest to-transparent pointer-events-none" />
              <button
                type="button"
                onClick={onOpenQuadrant}
                className="relative z-10 text-left font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                +{overflow} more
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
});
