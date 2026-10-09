import { useMemo } from 'react';
import type { CalendarEvent, EventChecklistItem, Subject, TodoTask } from '../../types';
import { isSameDay } from '../../utils/time';
import { isOverdue } from '../todo/TodoRows';

interface SubjectTasksPanelProps {
  /** The calendar day being shown — the panel lists that day's event tasks. */
  date: Date;
  /** Events of the shown day (any kind). */
  events: CalendarEvent[];
  subjects: Subject[];
  onToggleTask: (eventId: string, itemId: string, done: boolean) => void;
  /** All todo tasks; the ones due on `date` are listed after the subjects. */
  todos?: TodoTask[];
  onToggleTodo?: (id: string, completed: boolean) => void;
}

interface GroupItem {
  eventId: string;
  item: EventChecklistItem;
}

interface Group {
  key: string;
  name: string;
  color: string;
  items: GroupItem[];
}

/**
 * Aggregated per-subject checklist: every mini task attached to the day's
 * events, grouped under its subject (color dot + name), each with a checkbox.
 * Replaces the old Urgent & Important card in the day tab.
 */
export function SubjectTasksPanel({ date, events, subjects, onToggleTask, todos = [], onToggleTodo }: SubjectTasksPanelProps) {
  const groups = useMemo<Group[]>(() => {
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const byKey = new Map<string, Group>();
    const sorted = [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    for (const e of sorted) {
      if (!e.checklist || e.checklist.length === 0) continue;
      const key = e.subjectId || '__other__';
      let group = byKey.get(key);
      if (!group) {
        const subject = subjectMap.get(e.subjectId);
        group = {
          key,
          name: subject?.name || (e.subjectId ? e.title : 'Other'),
          color: subject?.color || 'var(--color-on-surface-variant)',
          items: [],
        };
        byKey.set(key, group);
      }
      for (const item of e.checklist) {
        group.items.push({ eventId: e.id, item });
      }
    }
    // Subject order first (as in the Subjects page), custom group last.
    const ordered = subjects.flatMap((s) => {
      const g = byKey.get(s.id);
      return g ? [g] : [];
    });
    const other = byKey.get('__other__');
    if (other) ordered.push(other);
    return ordered;
  }, [events, subjects]);

  // Todo tasks due on the shown day. Today also carries the open ones that
  // are still overdue from earlier days, so nothing slips out of sight.
  const dayTodos = useMemo(() => {
    const today = isSameDay(date, new Date());
    return todos
      .filter((t) => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        if (Number.isNaN(due.getTime())) return false;
        return isSameDay(due, date) || (today && isOverdue(t) && due.getTime() < date.getTime());
      })
      .sort((a, b) => Date.parse(a.dueDate!) - Date.parse(b.dueDate!));
  }, [todos, date]);

  const total = groups.reduce((n, g) => n + g.items.length, 0) + dayTodos.length;
  const done =
    groups.reduce((n, g) => n + g.items.filter((i) => i.item.done).length, 0) +
    dayTodos.filter((t) => t.completed).length;
  const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <section
      aria-label={`Checklist for ${dayLabel}`}
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-6 max-lg:p-4 flex flex-col min-h-0 flex-1 overflow-y-auto animate-fade-in"
    >
      <div className="flex items-baseline justify-between gap-3 mb-4 max-lg:mb-2">
        <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant tracking-[0.16em]">
          Checklist
        </h2>
        <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant/70 tracking-[0.14em] flex-shrink-0">
          {dayLabel}
        </span>
        <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0 ml-auto">
          {total > 0 ? `${done}/${total}` : '0'}
        </span>
      </div>

      {groups.length === 0 && dayTodos.length === 0 ? (
        <p className="font-body-sm text-body-sm max-lg:!text-[9px] text-on-surface-variant">
          Nothing to check for {dayLabel} — open an event to add items
        </p>
      ) : (
        <ul className="flex flex-col gap-4 max-lg:gap-3 overflow-y-auto min-h-0 flex-1">
          {groups.map((group) => (
            <li key={group.key} className="min-w-0">
              <p className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                <span className="font-body-md text-body-md max-lg:!text-[11px] text-on-surface font-semibold truncate">
                  {group.name}
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {group.items.map(({ eventId, item }) => (
                  <li key={`${eventId}:${item.id}`} className="flex items-start gap-2.5 max-lg:gap-2 py-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                      onClick={() => onToggleTask(eventId, item.id, !item.done)}
                      className={`w-5 h-5 max-lg:w-4 max-lg:h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        item.done
                          ? 'bg-primary border-primary text-on-primary'
                          : 'border-outline hover:border-primary bg-transparent'
                      }`}
                    >
                      {item.done && (
                        <span className="material-symbols-outlined text-[11px] max-lg:text-[9px] leading-none">check</span>
                      )}
                    </button>
                    <span
                      className={`font-body-md text-body-md max-lg:!text-[10px] min-w-0 flex-1 break-words ${
                        item.done ? 'text-on-surface-variant/70 line-through' : 'text-on-surface'
                      }`}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {dayTodos.length > 0 && (
            <li className="min-w-0">
              <p className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-[14px] max-lg:text-[12px] leading-none text-on-surface-variant flex-shrink-0">
                  checklist
                </span>
                <span className="font-body-md text-body-md max-lg:!text-[11px] text-on-surface font-semibold truncate">
                  Todo
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {dayTodos.map((task) => {
                  const due = new Date(task.dueDate!);
                  const overdue = isOverdue(task);
                  // Earlier day: show the date; same day: the picked time, if any.
                  const when = !isSameDay(due, date)
                    ? due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : task.dueHasTime
                      ? `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
                      : null;
                  return (
                    <li key={task.id} className="flex items-start gap-2.5 max-lg:gap-2 py-1">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={task.completed}
                        aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
                        onClick={() => onToggleTodo?.(task.id, !task.completed)}
                        className={`w-5 h-5 max-lg:w-4 max-lg:h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          task.completed
                            ? 'bg-primary border-primary text-on-primary'
                            : 'border-outline hover:border-primary bg-transparent'
                        }`}
                      >
                        {task.completed && (
                          <span className="material-symbols-outlined text-[11px] max-lg:text-[9px] leading-none">check</span>
                        )}
                      </button>
                      <span
                        className={`font-body-md text-body-md max-lg:!text-[10px] min-w-0 flex-1 break-words ${
                          task.completed ? 'text-on-surface-variant/70 line-through' : 'text-on-surface'
                        }`}
                      >
                        {task.title}
                      </span>
                      {when && (
                        <span
                          className={`font-body-sm text-body-sm max-lg:!text-[9px] tabular-nums flex-shrink-0 mt-px ${
                            overdue ? 'text-error' : 'text-on-surface-variant'
                          }`}
                        >
                          {when}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
