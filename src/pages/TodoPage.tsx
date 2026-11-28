import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { subjectRepo, todoRepo, tombstoneRepo } from '../services/repositories';
import { useSyncRefresh } from '../hooks/useServerSync';
import { useOverscrollSpring } from '../hooks/useOverscrollSpring';
import { useTodoQuadrantDrag } from '../hooks/useTodoQuadrantDrag';
import { syncOnce } from '../services/serverSync';
import { checkpoint, undo, undoLabel } from '../services/history';
import { dateKey } from '../utils/time';
import type { TodoTask } from '../types';
import { KanbanBoard, stageOf, type Stage } from '../components/todo/KanbanBoard';
import { QuadrantCard } from '../components/todo/QuadrantCard';
import { QuadrantDialog } from '../components/todo/QuadrantDialog';
import { TodoForm } from '../components/todo/TodoForm';
import { TodoList } from '../components/mobile/TodoList';
import { useIsMobile } from '../hooks/useIsMobile';
import { matchShortcut, singleKeysOn, isTypingTarget } from '../services/shortcuts';
import { hasOpenOverlay } from '../services/overlays';

const QUADRANTS = [
  { key: 'ii', important: true, urgent: true, title: 'Urgent & Important' },
  { key: 'in', important: true, urgent: false, title: 'Important' },
  { key: 'ni', important: false, urgent: true, title: 'Urgent' },
  { key: 'nn', important: false, urgent: false, title: 'Neither' },
] as const;

type QuadrantKey = (typeof QUADRANTS)[number]['key'];

function isDueBy(task: TodoTask, day: string): boolean {
  return !!task.dueDate && dateKey(new Date(task.dueDate)) <= day;
}

export function TodoPage() {
  const isMobile = useIsMobile();
  const [board, setBoard] = useState(() => localStorage.getItem('cdmm.todo-view') === 'kanban');
  const viewSwitch = <div role="group" aria-label="Todo view" className="inline-flex shrink-0 rounded-xl border border-outline-variant bg-surface-container-low p-1">
    {['Matrix', 'Kanban'].map((name, i) => <button key={name} type="button" aria-pressed={board === Boolean(i)}
      className={'rounded-lg px-3 py-1 text-caption ' + (board === Boolean(i) ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant')}
      onClick={() => { setBoard(Boolean(i)); localStorage.setItem('cdmm.todo-view', i ? 'kanban' : 'matrix'); }}>{name}</button>)}
  </div>;
  const location = useLocation();
  const navigate = useNavigate();
  const springRef = useOverscrollSpring<HTMLDivElement>();
  const [subjects, setSubjects] = useState(() => subjectRepo.getAll());
  const [todos, setTodos] = useState<TodoTask[]>(() => todoRepo.getAll());
  const [openQuadrant, setOpenQuadrant] = useState<QuadrantKey | null>(null);
  const [formState, setFormState] = useState<{
    task: TodoTask | null;
    quadrant: QuadrantKey;
  } | null>(null);
  const quadrantRefs = useRef<Record<QuadrantKey, HTMLButtonElement | null>>(
    { ii: null, ni: null, in: null, nn: null }
  );

  useEffect(() => {
    const id = (location.state as { taskId?: string } | null)?.taskId;
    const task = id ? todoRepo.getById(id) : undefined;
    if (!task) return;
    const quadrant: QuadrantKey = task.important ? task.urgent ? 'ii' : 'in' : task.urgent ? 'ni' : 'nn';
    setFormState({ task, quadrant });
    navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);

  const refresh = useCallback(() => {
    setTodos(todoRepo.getAll());
    setSubjects(subjectRepo.getAll());
  }, []);

  useSyncRefresh(refresh);

  const moveTask = useCallback((id: string, key: string) => {
    const target = QUADRANTS.find(q => q.key === key);
    const task = todoRepo.getById(id);
    if (!target || !task || task.completed || (task.important === target.important && task.urgent === target.urgent)) return;

    checkpoint('Move task');
    todoRepo.update(id, {
      important: target.important,
      urgent: target.urgent,
      autoUrgencyDismissed: !target.urgent && isDueBy(task, dateKey(new Date())),
    });
    refresh();
  }, [refresh]);
  const quadrantDrag = useTodoQuadrantDrag(!isMobile, moveTask);

  // N or A (by default, see services/shortcuts) opens a new task (plain quadrant: not urgent, not important);
  // skipped while typing or when a modal is open, same guards as the
  // calendar shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
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
      // Asks the overlay stack: a DOM query for '.fixed.inset-0' matched the
      // app shell itself, so the keys never fired.
      if (hasOpenOverlay()) return;
      if (matchShortcut(e, 'todo-new')) {
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
  // A deliberate move back to a non-urgent quadrant dismisses this promotion
  // for that deadline. Replacing the deadline re-enables it.
  useEffect(() => {
    const promoteDue = () => {
      const today = dateKey(new Date());
      const due = todos.filter(
        (t) =>
          !t.urgent &&
          !t.completed &&
          !t.autoUrgencyDismissed &&
          isDueBy(t, today)
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
    if (board) void syncOnce().catch(() => { /* Background sync retries offline changes. */ });
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

  const handleSave = (data: Omit<TodoTask, 'id' | 'uid' | 'createdAt' | 'updatedAt' | 'completed'>) => {
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
      subjects={subjects}
      defaults={{
        important: QUADRANTS.find((q) => q.key === formState.quadrant)!.important,
        urgent: QUADRANTS.find((q) => q.key === formState.quadrant)!.urgent,
      }}
      onSave={handleSave}
      onDelete={handleDelete}
      onCancel={() => setFormState(null)}
    />
  );

  const changeStage = (id: string, stage: Stage) => {
    const task = todoRepo.getById(id);
    if (!task || stageOf(task) === stage) return;
    checkpoint('Move task');
    todoRepo.update(id, {
      inProgress: stage === 'active',
      ...(task.completed !== (stage === 'done') ? { completed: stage === 'done' } : {}),
    });
    refresh();
    void syncOnce().catch(() => { /* Background sync retries offline changes. */ });
  };
  const undoName = undoLabel();
  const mobileHeader = (
    <header className="m-hdr" style={{ paddingLeft: 16 }}>
      <h1 className="m-h1 flex-1">Todo</h1>
      {viewSwitch}
      <button type="button" className="m-ib" aria-label={undoName ? `Undo: ${undoName.toLowerCase()}` : 'Undo'}
        disabled={!undoName} onClick={() => {
          undo();
          refresh();
          if (board) void syncOnce().catch(() => { /* Background sync retries offline changes. */ });
        }}>
        <span className="material-symbols-outlined m-ic">undo</span>
      </button>
    </header>
  );
  if (board) return <div className="flex w-full min-h-0 flex-1 flex-col overflow-hidden">
    {isMobile ? mobileHeader : (
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-title">Todo</h1>{viewSwitch}
      </header>
    )}
    <KanbanBoard tasks={todos} subjects={subjects} onMove={changeStage} onToggle={handleToggle}
      onOpen={task => setFormState({ task, quadrant: task.important ? task.urgent ? 'ii' : 'in' : task.urgent ? 'ni' : 'nn' })}
      onAdd={() => setFormState({ task: null, quadrant: 'nn' })}/>
    {todoForm}
  </div>;

  if (isMobile) {
    return (
      <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
        {mobileHeader}
        <TodoList
          byQuadrant={byQuadrant}
          subjects={subjects}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onOpen={(task) => {
            const key: QuadrantKey = task.important && task.urgent ? 'ii' : task.urgent ? 'ni' : task.important ? 'in' : 'nn';
            setFormState({ task, quadrant: key });
          }}
          onAdd={(title, subjectId, important, urgent) => {
            // Urgent needs a day, so it is due today; anything else starts
            // undated — a date would make it urgent on the spot (see above).
            checkpoint('Create task');
            todoRepo.create({
              title,
              subjectId,
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
    <div className="flex flex-col w-full flex-1 min-h-0 relative max-lg:overflow-hidden" onKeyDown={e => {
      if (e.defaultPrevented || e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey || !singleKeysOn() || isTypingTarget(e.target)) return;
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-todo-task]');
      const task = todos.find(t => t.id === row?.dataset.todoTask);
      if (!task) return;
      if (!e.shiftKey && e.key === 'Delete') {
        e.preventDefault(); e.stopPropagation(); if (!e.repeat) handleDelete(task.id);
      } else if (e.shiftKey && e.code === 'KeyD') {
        e.preventDefault(); e.stopPropagation(); if (e.repeat) return;
        checkpoint('Duplicate task');
        todoRepo.create({ title: task.title, subjectId: subjectRepo.getById(task.subjectId)?.id ?? '', scheduledDate: task.scheduledDate, description: task.description, important: task.important, urgent: task.urgent, dueDate: task.dueDate, dueHasTime: task.dueHasTime, estMinutes: task.estMinutes, completed: false, reminders: task.reminders });
        refresh();
      }
    }}>
      <div className="mb-8 max-lg:mb-3 flex-shrink-0">
        <div className="flex items-center justify-between"><h1 className="text-title text-on-surface mb-1">Todo</h1>{viewSwitch}</div>
      </div>

      <div ref={springRef} onPointerDown={quadrantDrag.onPointerDown} className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 max-lg:auto-rows-max max-lg:content-start max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:pb-24">
        {QUADRANTS.map((q) => (
          <div key={q.key} className="min-h-0 max-lg:min-h-fit flex">
            <div className="flex-1 min-w-0">
          <QuadrantCard
            ref={(el) => {
              quadrantRefs.current[q.key] = el;
            }}
            quadrant={q.key}
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

      {createPortal(
        <div ref={quadrantDrag.ghost} data-todo-drag-ghost hidden aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-[110] size-14">
          <div className="flex size-full items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest/80 text-on-surface shadow-elev-3 motion-safe:animate-pop-in">
            <span className="material-symbols-outlined text-[25px] leading-none">task_alt</span>
          </div>
        </div>,
        document.body,
      )}

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
