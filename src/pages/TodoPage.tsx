import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { todoRepo, tombstoneRepo } from '../services/repositories';
import { useSyncRefresh } from '../hooks/useServerSync';
import { useOverscrollSpring } from '../hooks/useOverscrollSpring';
import { checkpoint } from '../services/history';
import { dateKey } from '../utils/time';
import type { TodoReminder, TodoTask } from '../types';
import { QuadrantCard } from '../components/todo/QuadrantCard';
import { QuadrantDialog } from '../components/todo/QuadrantDialog';
import { TodoForm } from '../components/todo/TodoForm';
import { TodoList } from '../components/mobile/TodoList';
import { useIsMobile } from '../hooks/useIsMobile';

const QUADRANTS = [
  { key: 'ii', important: true, urgent: true, title: 'Urgent & Important' },
  { key: 'in', important: true, urgent: false, title: 'Important' },
  { key: 'ni', important: false, urgent: true, title: 'Urgent' },
  { key: 'nn', important: false, urgent: false, title: 'Neither' },
] as const;

type QuadrantKey = (typeof QUADRANTS)[number]['key'];

export function TodoPage() {
  const isMobile = useIsMobile();
  const springRef = useOverscrollSpring<HTMLDivElement>();
  const [todos, setTodos] = useState<TodoTask[]>(() => todoRepo.getAll());
  const [openQuadrant, setOpenQuadrant] = useState<QuadrantKey | null>(null);
  const [formState, setFormState] = useState<{
    task: TodoTask | null;
    quadrant: QuadrantKey;
  } | null>(null);
  const quadrantRefs = useRef<Record<QuadrantKey, HTMLButtonElement | null>>(
    { ii: null, ni: null, in: null, nn: null }
  );

  const refresh = useCallback(() => setTodos(todoRepo.getAll()), []);

  useSyncRefresh(refresh);

  // N or A opens a new task (plain quadrant: not urgent, not important);
  // skipped while typing or when a modal is open, same guards as the
  // calendar shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('.fixed.inset-0')) return;
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
      const key = letter || e.key.toLowerCase();
      if (key === 'n' || key === 'a') {
        // The form focuses its title field before the key finishes, so
        // without this the letter would be typed into it.
        e.preventDefault();
        setFormState((prev) => prev || { task: null, quadrant: 'nn' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Smart transition: an incomplete task becomes urgent as soon as its due day
  // is here — today or already past. Urgency comes from the clock, so the
  // Important flag does not gate it: a non-important task due today is still
  // urgent, it just lands in "Urgent" rather than "Urgent & Important".
  // Persisted via the repo so sync and the edit form see urgent=true.
  useEffect(() => {
    const promoteDue = () => {
      const today = dateKey(new Date());
      const due = todos.filter(
        (t) =>
          !t.urgent &&
          !t.completed &&
          t.dueDate &&
          dateKey(new Date(t.dueDate)) <= today
      );
      if (due.length === 0) return;
      for (const t of due) todoRepo.update(t.id, { urgent: true });
      refresh();
    };
    promoteDue();
    // A task that was due "tomorrow" becomes due "today" while this page sits
    // open, so re-check whenever the tab is looked at again.
    document.addEventListener('visibilitychange', promoteDue);
    window.addEventListener('focus', promoteDue);
    return () => {
      document.removeEventListener('visibilitychange', promoteDue);
      window.removeEventListener('focus', promoteDue);
    };
  }, [todos, refresh]);

  const byQuadrant = useMemo(() => {
    const map: Record<QuadrantKey, TodoTask[]> = { ii: [], ni: [], in: [], nn: [] };
    for (const t of todos) {
      const key: QuadrantKey = t.important && t.urgent ? 'ii' : t.urgent ? 'ni' : t.important ? 'in' : 'nn';
      map[key].push(t);
    }
    for (const key of Object.keys(map) as QuadrantKey[]) {
      map[key].sort(
        (a, b) =>
          Number(a.completed) - Number(b.completed) ||
          (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
            (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
      );
    }
    return map;
  }, [todos]);

  const handleToggle = (id: string, completed: boolean) => {
    checkpoint(completed ? 'Complete task' : 'Reopen task');
    todoRepo.update(id, { completed });
    refresh();
  };

  const handleDelete = (id: string) => {
    const removed = todoRepo.getById(id);
    if (!removed) return;
    checkpoint('Delete task');
    tombstoneRepo.add('todos', removed.id);
    todoRepo.delete(id);
    setFormState(null);
    refresh();
  };

  const handleSave = (data: {
    title: string;
    description?: string;
    important: boolean;
    urgent: boolean;
    dueDate?: string;
    dueHasTime: boolean;
    estMinutes?: number;
    reminders: TodoReminder[];
  }) => {
    if (formState?.task) {
      checkpoint('Edit task');
      todoRepo.update(formState.task.id, data);
    } else {
      checkpoint('Create task');
      todoRepo.create({ ...data, completed: false });
    }
    setFormState(null);
    refresh();
  };

  const closeDialog = () => {
    const key = openQuadrant;
    setOpenQuadrant(null);
    if (key) quadrantRefs.current[key]?.focus();
  };

  const quadrant = openQuadrant ? QUADRANTS.find((q) => q.key === openQuadrant)! : null;

  const todoForm = formState && (
    <TodoForm
      task={formState.task}
      defaults={{
        important: QUADRANTS.find((q) => q.key === formState.quadrant)!.important,
        urgent: QUADRANTS.find((q) => q.key === formState.quadrant)!.urgent,
      }}
      onSave={handleSave}
      onDelete={handleDelete}
      onCancel={() => setFormState(null)}
    />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
        <TodoList
          byQuadrant={byQuadrant}
          openCount={todos.filter((t) => !t.completed).length}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onOpen={(task) => {
            const key: QuadrantKey = task.important && task.urgent ? 'ii' : task.urgent ? 'ni' : task.important ? 'in' : 'nn';
            setFormState({ task, quadrant: key });
          }}
          onAdd={(title, important, urgent) => {
            // Urgent needs a day, so it is due today; anything else starts
            // undated — a date would make it urgent on the spot (see above).
            checkpoint('Create task');
            todoRepo.create({
              title,
              important,
              urgent,
              dueDate: urgent ? new Date(`${dateKey(new Date())}T18:00:00`).toISOString() : undefined,
              dueHasTime: false,
              reminders: [],
              completed: false,
            });
            refresh();
          }}
        />
        {todoForm}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 relative max-lg:overflow-hidden">
      <div className="mb-8 max-lg:mb-3 flex-shrink-0">
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Todo</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {todos.filter((t) => !t.completed).length} open tasks
        </p>
      </div>

      <div ref={springRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 max-lg:auto-rows-max max-lg:content-start max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:pb-24">
        {QUADRANTS.map((q) => (
          <div key={q.key} className="min-h-0 max-lg:min-h-fit flex">
            <div className="flex-1 min-w-0">
          <QuadrantCard
            ref={(el) => {
              quadrantRefs.current[q.key] = el;
            }}
            title={q.title}
            tasks={byQuadrant[q.key]}
            onToggle={handleToggle}
            onOpenTask={(task) => setFormState({ task, quadrant: q.key })}
            onOpenQuadrant={() => setOpenQuadrant(q.key)}
            onAdd={() => setFormState({ task: null, quadrant: q.key })}
          />
            </div>
          </div>
        ))}
      </div>

      {quadrant && (
        <QuadrantDialog
          title={quadrant.title}
          tasks={byQuadrant[quadrant.key]}
          onToggle={handleToggle}
          onOpenTask={(task) => setFormState({ task, quadrant: quadrant.key })}
          onAdd={() => setFormState({ task: null, quadrant: quadrant.key })}
          onClose={closeDialog}
        />
      )}

      {todoForm}
    </div>
  );
}
