import { useMemo, useRef, useState, useCallback } from 'react';
import { todoRepo, tombstoneRepo } from '../services/repositories';
import { useSyncRefresh } from '../hooks/useServerSync';
import type { TodoTask } from '../types';
import { QuadrantCard } from '../components/todo/QuadrantCard';
import { QuadrantDialog } from '../components/todo/QuadrantDialog';
import { TodoForm } from '../components/todo/TodoForm';

const QUADRANTS = [
  { key: 'ii', important: true, urgent: true, title: 'Важное и срочное' },
  { key: 'ni', important: false, urgent: true, title: 'Срочное и не важное' },
  { key: 'in', important: true, urgent: false, title: 'Важное и не срочное' },
  { key: 'nn', important: false, urgent: false, title: 'Не важное и не срочное' },
] as const;

type QuadrantKey = (typeof QUADRANTS)[number]['key'];

export function TodoPage() {
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
    todoRepo.update(id, { completed });
    refresh();
  };

  const handleDelete = (id: string) => {
    const removed = todoRepo.getById(id);
    if (removed) tombstoneRepo.add('todos', removed.id);
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
  }) => {
    if (formState?.task) {
      todoRepo.update(formState.task.id, data);
    } else {
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

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="mb-8">
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">TODO</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {todos.filter((t) => !t.completed).length} open tasks
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-lg:flex-1">
        {QUADRANTS.map((q) => (
          <QuadrantCard
            key={q.key}
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

      {formState && (
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
      )}
    </div>
  );
}
