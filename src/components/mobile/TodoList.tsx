import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TodoTask } from '../../types';
import { formatDuration } from '../../utils/time';
import { formatDueLabel, isOverdue } from '../todo/TodoRows';
import { SwipeRow } from './SwipeRow';
import { useNewKeys } from '../../hooks/useNewKeys';
import { useBelowDock } from './belowDock';
import { undo, undoLabel } from '../../services/history';
import { AutoGrowTextarea } from '../common/AutoGrowTextarea';

export type QuadrantKey = 'ii' | 'in' | 'ni' | 'nn';

/** `title` is the full name; `short` and `icon` label the quadrant tab. */
export const MOBILE_QUADRANTS: { key: QuadrantKey; important: boolean; urgent: boolean; title: string; short: string; icon: string }[] = [
  { key: 'ii', important: true, urgent: true, title: 'Urgent & important', short: 'Do first', icon: 'local_fire_department' },
  { key: 'in', important: true, urgent: false, title: 'Important', short: 'Important', icon: 'flag' },
  { key: 'ni', important: false, urgent: true, title: 'Urgent', short: 'Urgent', icon: 'bolt' },
  { key: 'nn', important: false, urgent: false, title: 'Neither', short: 'Later', icon: 'inbox' },
];

const QUADRANT_KEY = 'cdmm.todo-quadrant';

function loadQuadrant(): QuadrantKey {
  try {
    const v = localStorage.getItem(QUADRANT_KEY);
    return v === 'ii' || v === 'in' || v === 'ni' || v === 'nn' ? v : 'ii';
  } catch {
    return 'ii';
  }
}

interface TodoListProps {
  byQuadrant: Record<QuadrantKey, TodoTask[]>;
  openCount: number;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onOpen: (task: TodoTask) => void;
  /** Quick add from the bottom bar. */
  onAdd: (title: string, important: boolean, urgent: boolean) => void;
}

function hasUpcomingReminder(task: TodoTask): boolean {
  const now = Date.now();
  return !task.completed && (task.reminders ?? []).some((r) => Date.parse(r.at) > now);
}

/**
 * The phone's Todo page: the four quadrants as one row of tabs (icon and
 * open count; the picked one also its name), swipeable rows (right: done, left: delete), the done ones folded
 * away, and an add bar whose Important / Urgent toggles start from the
 * picked quadrant.
 */
export function TodoList({ byQuadrant, openCount, onToggle, onDelete, onOpen, onAdd }: TodoListProps) {
  const [quadrant, setQuadrantState] = useState<QuadrantKey>(loadQuadrant);
  const q = MOBILE_QUADRANTS.find((x) => x.key === quadrant)!;
  const [important, setImportant] = useState(q.important);
  const [urgent, setUrgent] = useState(q.urgent);
  const [text, setText] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [focused, setFocused] = useState(false);
  // The add bar sits under the session dock, in the shell's slot for it.
  const formRef = useRef<HTMLFormElement>(null);
  const belowDock = useBelowDock(formRef, focused);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const setQuadrant = (key: QuadrantKey) => {
    setQuadrantState(key);
    const next = MOBILE_QUADRANTS.find((x) => x.key === key)!;
    setImportant(next.important);
    setUrgent(next.urgent);
    try {
      localStorage.setItem(QUADRANT_KEY, key);
    } catch {
      // storage unavailable — the pick just isn't remembered
    }
  };

  const tasks = byQuadrant[quadrant];
  const active = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.completed), [tasks]);
  const undoName = undoLabel();
  const added = useNewKeys(tasks.map((t) => t.id), quadrant);

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    onAdd(title, important, urgent);
    setText('');
    inputRef.current?.focus();
  };

  const row = (t: TodoTask) => {
    const due = formatDueLabel(t.dueDate, t.completed, t.dueHasTime);
    const overdue = isOverdue(t);
    const sub = [due, t.estMinutes ? formatDuration(t.estMinutes) : null].filter(Boolean).join(' · ');
    return (
      <SwipeRow
        key={t.id}
        enter={added.has(t.id)}
        open={openRow === t.id}
        onOpenChange={(o) => setOpenRow(o ? t.id : null)}
        start={{ label: t.completed ? 'Undo' : 'Done', icon: t.completed ? 'undo' : 'check', tone: 'pri', onClick: () => onToggle(t.id, !t.completed) }}
        end={[{ label: 'Delete', icon: 'delete', tone: 'err', onClick: () => onDelete(t.id) }]}
      >
        <div className="m-li" style={{ minHeight: 64, borderBottom: 0, background: 'transparent' }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={t.completed}
            aria-label={t.completed ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
            onClick={() => onToggle(t.id, !t.completed)}
            className="flex items-center justify-center -m-[10px]"
            style={{ width: 44, height: 44, background: 'none', border: 0, flex: 'none' }}
          >
            <span className={`m-cb ${t.completed ? 'on' : ''}`}>{t.completed && <span className="material-symbols-outlined m-ic xs">check</span>}</span>
          </button>
          <button type="button" onClick={() => onOpen(t)} className="flex flex-col flex-1 min-w-0 text-left bg-transparent border-0 p-0 text-inherit" style={{ minHeight: 44, justifyContent: 'center' }}>
            <span className={`m-tr ${t.completed ? 'm-mut line-through' : ''}`}>{t.title}</span>
            {sub && (
              <span className="m-sm flex items-center m-num" style={{ gap: 4, color: overdue ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}>
                {overdue && <span className="m-dot" style={{ width: 6, height: 6, background: 'var(--color-error)' }} />}
                {sub}
              </span>
            )}
          </button>
          {hasUpcomingReminder(t) && <span className="material-symbols-outlined m-ic s m-mut" aria-label="Reminder set">notifications</span>}
        </div>
      </SwipeRow>
    );
  };

  const addBar = (
    <form
      ref={formRef}
      className="m-addbar"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        {/* The box centres the line itself (flex), so the text sits mid-box
            whatever padding a browser adds inside a textarea. */}
        <label className="m-in flex-1" style={{ padding: '11px 14px' }}>
          <AutoGrowTextarea
            ref={inputRef}
            className="flex-1 min-w-0 p-0 bg-transparent border-0 outline-none text-[16px] leading-[20px] text-on-surface placeholder:text-on-surface-variant"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`New task · ${MOBILE_QUADRANTS.find((x) => x.important === important && x.urgent === urgent)!.title}`}
            aria-label="New task"
            enterKeyHint="done"
          />
        </label>
        {([
          ['Important', 'flag', important, setImportant],
          ['Urgent', 'bolt', urgent, setUrgent],
        ] as const).map(([label, icon, on, set]) => (
          <button
            key={label}
            type="button"
            aria-label={`${label}, ${on ? 'on' : 'off'}`}
            aria-pressed={on}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => set(!on)}
            className="m-ib"
            style={{
              border: `1px solid ${on ? 'var(--color-outline)' : 'var(--color-outline-variant)'}`,
              background: on ? 'var(--color-secondary-container)' : 'none',
              color: on ? 'var(--color-on-secondary-container)' : 'var(--color-on-surface-variant)',
            }}
          >
            <span className="material-symbols-outlined m-ic s">{icon}</span>
          </button>
        ))}
        <button type="submit" className="m-btn pri sq" aria-label="Add task" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()}>
          <span className="material-symbols-outlined m-ic s">arrow_upward</span>
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="m-hdr" style={{ paddingLeft: 16 }}>
        <h1 className="m-h1 flex-1">Todo</h1>
        <span className="m-sm m-mut" style={{ paddingRight: 8 }}>{openCount} open</span>
        <button type="button" className="m-ib" aria-label={undoName ? `Undo: ${undoName.toLowerCase()}` : 'Undo'} disabled={!undoName} onClick={() => undo()}>
          <span className="material-symbols-outlined m-ic">undo</span>
        </button>
      </header>

      <div className="flex-none" style={{ padding: '8px 12px 4px' }}>
        <div className="m-seg m-quad" role="tablist" aria-label="Quadrant">
          {MOBILE_QUADRANTS.map((x) => {
            const on = x.key === quadrant;
            const count = byQuadrant[x.key].filter((t) => !t.completed).length;
            return (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${x.title}, ${count} open`}
                onClick={() => setQuadrant(x.key)}
                className={on ? 'on' : ''}
              >
                <span className="material-symbols-outlined m-ic s">{x.icon}</span>
                {on && <span>{x.short}</span>}
                <span className="m-num n">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto [touch-action:pan-y]">
        {active.length === 0 && <p className="m-sm m-mut" style={{ padding: '8px 16px' }}>Nothing here. Add a task below.</p>}
        {active.map(row)}
        {done.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((v) => !v)}
              className="flex items-center w-full bg-transparent border-0 m-mut"
              style={{ height: 48, padding: '0 16px', gap: 8 }}
            >
              <span className="material-symbols-outlined m-ic s">{showDone ? 'expand_less' : 'expand_more'}</span>
              <span className="m-lbl">Completed · {done.length}</span>
            </button>
            {showDone && done.map(row)}
          </>
        )}
      </div>

      {belowDock ? createPortal(addBar, belowDock) : addBar}
    </div>
  );
}
