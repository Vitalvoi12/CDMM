import { useEffect, useMemo, useRef } from 'react';
import type { TodoTask } from '../../types';
import { FullTodoRow } from './TodoRows';
import { useEscapeOverlay } from '../../services/overlays';

interface QuadrantDialogProps {
  title: string;
  tasks: TodoTask[];
  onToggle: (id: string, completed: boolean) => void;
  onOpenTask: (task: TodoTask) => void;
  onAdd: () => void;
  onClose: () => void;
}

export function QuadrantDialog({ title, tasks, onToggle, onOpenTask, onAdd, onClose }: QuadrantDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const active = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completed = useMemo(() => tasks.filter((t) => t.completed), [tasks]);

  useEscapeOverlay(onClose);

  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 max-lg:p-2 max-lg:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} tasks`}
        className="bg-surface-container-lowest rounded-2xl shadow-elev-3 w-[92vw] h-[92vh] max-lg:w-[calc(100vw-1rem)] max-lg:h-[calc(100dvh-1rem-env(safe-area-inset-bottom,0px))] flex flex-col overflow-hidden animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-outline-variant flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-headline-md text-headline-md text-on-surface truncate">{title}</h2>
            <p className="font-label-sm text-label-sm text-on-surface-variant tabular-nums mt-1">
              {active.length} active{completed.length > 0 ? ` · ${completed.length} completed` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onAdd}
              className="px-4 py-2 bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
            >
              Add task
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 flex items-center justify-center rounded hover:bg-surface-container transition-colors text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0">
          {active.length === 0 && completed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant opacity-50">task_alt</span>
              <p className="font-body-lg text-body-lg text-on-surface-variant">Nothing here yet</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant opacity-70">
                Add a task to this quadrant.
              </p>
            </div>
          ) : (
            <>
              {active.map((task) => (
                <FullTodoRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpenTask} />
              ))}
              {completed.length > 0 && (
                <>
                  <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest pt-6 pb-1">
                    Completed
                  </p>
                  {completed.map((task) => (
                    <FullTodoRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpenTask} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
