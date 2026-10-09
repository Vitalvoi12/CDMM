import { useCallback, useMemo, useState, type RefObject } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { DayTask, Subject, TodoTask } from '../../types';
import { isSameDay } from '../../utils/time';
import { isOverdue } from '../todo/TodoRows';
import { useEscapeOverlay } from '../../services/overlays';
import { useIsMobile } from '../../hooks/useIsMobile';

interface SubjectTasksPanelProps {
  /** The calendar day being shown — the panel lists that day's checklist. */
  date: Date;
  /** The day's own checklist tasks (not tied to any event). */
  tasks: DayTask[];
  subjects: Subject[];
  onToggleTask: (id: string, done: boolean) => void;
  onAddTask: (text: string, subjectId: string) => void;
  onDeleteTask: (id: string) => void;
  /**
   * Whether the new-task form is open — inline on desktop, a window on the
   * phone. Owned by the page, which also opens it (V, double tap).
   */
  adding: boolean;
  onAddingChange: (open: boolean) => void;
  /** The form's text field, so whoever opens the form can focus it. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** All todo tasks; the ones due on `date` are listed after the subjects. */
  todos?: TodoTask[];
  onToggleTodo?: (id: string, completed: boolean) => void;
}

interface Group {
  key: string;
  name: string;
  color: string;
  items: DayTask[];
}

/**
 * Subject of the last task added here, the default for the next one. Kept on
 * this device so it survives reloads.
 */
const LAST_SUBJECT_KEY = 'cdmm.checklist-subject';

function loadLastSubject(): string {
  try {
    return localStorage.getItem(LAST_SUBJECT_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLastSubject(id: string): void {
  try {
    localStorage.setItem(LAST_SUBJECT_KEY, id);
  } catch {
    // storage unavailable — the choice just isn't remembered
  }
}

/**
 * The day's checklist: tasks added here with "+", grouped under their subject
 * (color dot + name), each with a checkbox. A day needs no event of a subject
 * to hold tasks for it.
 */
export function SubjectTasksPanel({ date, tasks, subjects, onToggleTask, onAddTask, onDeleteTask, adding, onAddingChange, inputRef, todos = [], onToggleTodo }: SubjectTasksPanelProps) {
  const groups = useMemo<Group[]>(() => {
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const byKey = new Map<string, Group>();
    for (const t of tasks) {
      // A task whose subject was deleted falls back to the no-subject group.
      const key = subjectMap.has(t.subjectId) ? t.subjectId : '__other__';
      let group = byKey.get(key);
      if (!group) {
        const subject = subjectMap.get(key);
        group = {
          key,
          name: subject?.name || 'Other',
          color: subject?.color || 'var(--color-on-surface-variant)',
          items: [],
        };
        byKey.set(key, group);
      }
      group.items.push(t);
    }
    // Subject order first (as in the Subjects page), no-subject group last.
    const ordered = subjects.flatMap((s) => {
      const g = byKey.get(s.id);
      return g ? [g] : [];
    });
    const other = byKey.get('__other__');
    if (other) ordered.push(other);
    return ordered;
  }, [tasks, subjects]);

  const isMobile = useIsMobile();
  const [text, setText] = useState('');
  const [pickedSubjectId, setSubjectId] = useState(loadLastSubject);
  // A remembered subject that was deleted since falls back to none.
  const subjectId = subjects.some((s) => s.id === pickedSubjectId) ? pickedSubjectId : '';

  const closeAdd = useCallback(() => {
    onAddingChange(false);
    setText('');
  }, [onAddingChange]);

  // Render the form now and focus it inside the same tap: iOS only raises
  // the keyboard for a focus() made during the user's gesture.
  const openAdd = () => {
    flushSync(() => onAddingChange(true));
    inputRef.current?.focus();
  };

  const pickSubject = (id: string) => {
    setSubjectId(id);
    inputRef.current?.focus();
  };

  // "No subject" first, then subjects in Subjects-page order.
  const subjectChoices = [{ id: '', name: 'No subject', color: '' }, ...subjects];

  // Keyboard subject choice while typing: ↓ / Tab step to the next chip,
  // ↑ / Shift+Tab to the previous one. (Alt+digit was tried first, but
  // browsers on Linux/Windows switch tabs on it before the page sees it.)
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step =
      e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) ? 1
      : e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1
      : 0;
    if (!step) return;
    e.preventDefault();
    const i = subjectChoices.findIndex((s) => s.id === subjectId);
    const n = subjectChoices.length;
    pickSubject(subjectChoices[(i + step + n) % n].id);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddTask(trimmed, subjectId);
    saveLastSubject(subjectId);
    // Stay open for the next one.
    setText('');
    inputRef.current?.focus();
  };

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

  const total = tasks.length + dayTodos.length;
  const done = tasks.filter((t) => t.done).length + dayTodos.filter((t) => t.completed).length;
  const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const addForm = (
        <form
          className={`flex flex-col animate-fade-in ${isMobile ? 'gap-3' : 'gap-2 mb-4'}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <EscapeToClose onClose={closeAdd} />
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="New task"
              aria-label="New task"
              enterKeyHint="done"
              // 16px on the phone: iOS zooms into smaller fields on focus.
              className={`flex-1 min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 ${
                isMobile ? 'py-3 px-4 !text-[16px]' : 'py-2 px-3'
              }`}
            />
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Add task"
              onMouseDown={(e) => e.preventDefault()}
              className={`${isMobile ? 'w-12 h-12' : 'w-9 h-9'} flex-shrink-0 flex items-center justify-center rounded-xl bg-primary text-on-primary disabled:opacity-40 transition-opacity`}
            >
              <span className="material-symbols-outlined text-[18px] leading-none">check</span>
            </button>
          </div>
          <div className={`flex flex-wrap ${isMobile ? 'gap-2' : 'gap-1.5'}`} role="radiogroup" aria-label="Subject">
            {subjectChoices.map((s) => {
              const selected = subjectId === s.id;
              return (
                <button
                  key={s.id || '__none__'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  // Keep the caret (and the phone keyboard) in the text field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSubject(s.id)}
                  className={`flex items-center gap-1.5 rounded-full border font-body-sm text-body-sm transition-colors ${
                    isMobile ? 'px-3 py-1.5 !text-[14px]' : 'px-2.5 py-1'
                  } ${
                    selected
                      ? 'bg-secondary-container border-secondary-container text-on-secondary-container'
                      : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {s.color && (
                    <span className={`${isMobile ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full flex-shrink-0`} style={{ backgroundColor: s.color }} />
                  )}
                  {s.name}
                </button>
              );
            })}
          </div>
          <p className="max-lg:hidden font-body-sm text-[11px] text-on-surface-variant/70">
            ↑ / ↓ or Tab — change subject · Enter — add · Esc — close
          </p>
        </form>
  );

  return (
    <section
      aria-label={`Checklist for ${dayLabel}`}
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-6 max-lg:p-4 flex flex-col min-h-0 flex-1 overflow-y-auto animate-fade-in"
    >
      <div className="flex items-center justify-between gap-3 mb-4 max-lg:mb-2">
        <h2 className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant tracking-[0.16em]">
          Checklist
        </h2>
        <span className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant/70 tracking-[0.14em] flex-shrink-0">
          {dayLabel}
        </span>
        <span className="font-body-sm text-body-sm max-lg:!text-[9px] max-lg:leading-none text-on-surface-variant tabular-nums flex-shrink-0 ml-auto">
          {total > 0 ? `${done}/${total}` : '0'}
        </span>
        <button
          type="button"
          onClick={() => (adding ? closeAdd() : openAdd())}
          aria-label={adding ? 'Close new task' : 'Add a task'}
          aria-expanded={adding}
          title={adding ? 'Close' : 'Add a task (Shortcut: V)'}
          className={`w-7 h-7 max-lg:w-6 max-lg:h-6 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            adding
              ? 'bg-secondary-container border-secondary-container text-on-secondary-container'
              : 'border-outline-variant text-on-surface hover:border-primary hover:text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] max-lg:text-[15px] leading-none">{adding ? 'close' : 'add'}</span>
        </button>
      </div>

      {adding && !isMobile && addForm}
      {adding && isMobile && createPortal(
        <div
          className="overlay-root z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in"
          onClick={closeAdd}
          // React bubbles portal events to the page behind: keep its day
          // swipe and double tap from seeing touches made in this window.
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onTouchCancel={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New checklist task"
            className="bg-surface-container-lowest rounded-2xl p-5 shadow-elev-3 w-full max-w-md max-h-full overflow-y-auto flex flex-col gap-3 animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-headline-md text-headline-md !text-[16px] text-on-surface">
                New task <span className="text-on-surface-variant font-normal">· {dayLabel}</span>
              </h2>
              <button
                type="button"
                onClick={closeAdd}
                aria-label="Close new task"
                className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[22px] leading-none">close</span>
              </button>
            </div>
            {addForm}
          </div>
        </div>,
        document.body
      )}

      {groups.length === 0 && dayTodos.length === 0 ? (
        !adding && (
          <p className="font-body-sm text-body-sm max-lg:!text-[9px] text-on-surface-variant">
            Nothing to check for {dayLabel} — {isMobile ? 'double-tap to add a task' : 'press + or V to add a task'}
          </p>
        )
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
                {group.items.map((item) => (
                  <li key={item.id} className="group flex items-start gap-2.5 max-lg:gap-2 py-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                      onClick={() => onToggleTask(item.id, !item.done)}
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
                    {/* Always visible on touch screens; on desktop it shows on hover. */}
                    <button
                      type="button"
                      onClick={() => onDeleteTask(item.id)}
                      aria-label={`Delete "${item.text}"`}
                      title="Delete task"
                      className="flex-shrink-0 -my-0.5 w-6 h-6 max-lg:w-5 max-lg:h-5 flex items-center justify-center rounded-full text-on-surface-variant/50 hover:text-error lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus:outline-none"
                    >
                      <span className="material-symbols-outlined text-[16px] max-lg:text-[13px] leading-none">close</span>
                    </button>
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

/** While mounted, Escape closes the new-task row (via the shared overlay stack). */
function EscapeToClose({ onClose }: { onClose: () => void }) {
  useEscapeOverlay(onClose);
  return null;
}
