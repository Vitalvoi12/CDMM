import { TaskProgress } from '../common/TaskProgress';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { DayTask, Subject } from '../../types';
import { addDays, dateKey, formatDuration, isSameDay } from '../../utils/time';
import { EST_PRESETS, parseEstimate } from '../../utils/estimate';
import { ChecklistTaskDialog } from '../calendar/ChecklistTaskDialog';
import { SwipeRow } from './SwipeRow';
import { useNewKeys } from '../../hooks/useNewKeys';
import { useBelowDock } from './belowDock';
import { AutoGrowTextarea } from '../common/AutoGrowTextarea';

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

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface ChecklistProps {
  date: Date;
  tasks: DayTask[];
  subjects: Subject[];
  unscheduledTasks: DayTask[];
  scheduled: Record<string, string>;
  onToggleTask: (id: string, done: boolean) => void;
  onAddTask: (text: string, subjectId: string, estMinutes?: number) => void;
  onEditTask: (id: string, patch: { text: string; subjectId: string; estMinutes: number | undefined; progress?: number }) => void;
  onDeleteTask: (id: string) => void;
  /** Postpone a task to another day ("YYYY-MM-DD"). */
  onMoveTask: (id: string, to: string) => void;
  /** Swipe → Plan: put the task (checklist or todo) on the day's timeline. */
  onPlanTask: (task: { id: string; text: string; subjectId: string; estMinutes?: number }) => void;
  /** The add field, so V and a double tap can focus it. */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Static copy of a neighbouring day beside the page (SwipePager): no add
   *  bar (the page's own sits under the dock) and no task window. */
  peek?: boolean;
}

/**
 * The phone's Check tab: the day's checklist as swipeable rows (right: done,
 * left: plan / later = tomorrow / delete), unscheduled tasks, and an add bar at the
 * bottom (under the session dock) that rides above the keyboard while typing.
 */
export function Checklist({ date, tasks, subjects, unscheduledTasks, scheduled, onToggleTask, onAddTask, onEditTask, onDeleteTask, onMoveTask, onPlanTask, inputRef, peek = false }: ChecklistProps) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState(loadLastSubject);
  const [est, setEst] = useState<number | undefined>(undefined);
  // Typed custom estimate ("50", "1h 20m"); a preset tap clears it.
  const [estText, setEstText] = useState('');
  const estInvalid = parseEstimate(estText) === null;
  const [estOpen, setEstOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // The add bar sits under the session dock, in the shell's slot for it.
  const formRef = useRef<HTMLFormElement>(null);
  const belowDock = useBelowDock(formRef, focused);
  const byId = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const subjectId = byId.has(picked) ? picked : '';
  const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Tasks grouped under their subject, in Subjects-page order; tasks
  // without a (living) subject form the "No subject" group last.
  const groups = useMemo(() => {
    const byKey = new Map<string, DayTask[]>();
    for (const t of tasks) {
      const key = byId.has(t.subjectId) ? t.subjectId : '';
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    }
    return [...subjects, { id: '', name: 'No subject', color: 'var(--color-outline)' }].flatMap((s) => {
      const items = byKey.get(s.id);
      return items ? [{ key: s.id || '__other__', name: s.name, color: s.color, items }] : [];
    });
  }, [tasks, subjects, byId]);

  const [showOther, setShowOther] = useState(false);
  // Rows added while this day is on screen animate in.
  const added = useNewKeys([...tasks, ...unscheduledTasks].map((t) => t.id), dateKey(date));

  const open = tasks.filter((t) => !t.done).length;
  const left = tasks.reduce((s, t) => s + (t.done ? 0 : t.estMinutes || 0), 0);
  const editing = editingId ? [...tasks, ...unscheduledTasks].find((t) => t.id === editingId) : undefined;
  const choices = [{ id: '', name: 'No subject', color: 'var(--color-outline)' }, ...subjects];
  const current = byId.get(subjectId);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddTask(trimmed, subjectId, est);
    saveLastSubject(subjectId);
    setText('');
    setEst(undefined);
    setEstText('');
    setEstOpen(false);
    inputRef.current?.focus();
  };

  const taskRow = (t: DayTask) => {
    const planned = scheduled[t.id];
    const subject = byId.get(t.subjectId);
    return (
      <SwipeRow
        key={t.id}
        enter={added.has(t.id)}
        open={openRow === t.id}
        onOpenChange={(o) => setOpenRow(o ? t.id : null)}
        start={{ label: t.done ? 'Undo' : 'Done', icon: t.done ? 'undo' : 'check', tone: 'pri', onClick: () => onToggleTask(t.id, !t.done) }}
        end={[
          ...(!t.done
            ? [
                { label: 'Plan', icon: 'event', tone: 'sec' as const, onClick: () => onPlanTask(t) },
                { label: 'Later', icon: 'redo', tone: 'sec' as const, onClick: () => onMoveTask(t.id, dateKey(addDays(date, 1))) },
              ]
            : []),
          { label: 'Delete', icon: 'delete', tone: 'err' as const, onClick: () => onDeleteTask(t.id) },
        ]}
      >
        <div className="m-li" style={{ borderBottom: 0, background: 'transparent' }}>
          <button
            type="button"
            role="checkbox"
            aria-checked={t.done}
            aria-label={t.done ? `Mark "${t.text}" as not done` : `Mark "${t.text}" as done`}
            onClick={() => onToggleTask(t.id, !t.done)}
            className="flex items-center justify-center -m-[10px]"
            style={{ width: 44, height: 44, background: 'none', border: 0, flex: 'none' }}
          >
            <span className={`m-cb ${t.done ? 'on' : ''}`}>{t.done && <span className="material-symbols-outlined m-ic xs">check</span>}</span>
          </button>
          <button type="button" onClick={() => setEditingId(t.id)} className="flex flex-col flex-1 min-w-0 text-left bg-transparent border-0 p-0 text-inherit" style={{ minHeight: 44, justifyContent: 'center' }}>
            <span className={`m-tr ${t.done ? 'm-mut line-through' : ''}`}>{t.text} <TaskProgress value={t.done ? 100 : t.progress} /></span>
            {planned && (
              <span className="m-sm m-mut flex items-center" style={{ gap: 4 }}>
                <span className="material-symbols-outlined m-ic xs">event</span>
                Planned {isSameDay(new Date(planned), date) ? hhmm(planned) : `${new Date(planned).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hhmm(planned)}`}
              </span>
            )}
          </button>
          {t.estMinutes ? <span className="m-est m-num">{formatDuration(t.estMinutes)}</span> : null}
          {subject && <span className="m-sw" style={{ background: subject.color }} aria-label={subject.name} />}
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
      {(focused || text || estOpen) && (
        <div className="m-scx" role="radiogroup" aria-label="Subject">
          {choices.map((s) => (
            <button
              key={s.id || '__none__'}
              type="button"
              role="radio"
              aria-checked={subjectId === s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setPicked(s.id);
                inputRef.current?.focus();
              }}
              className={`m-chip ${subjectId === s.id ? 'on' : ''}`}
            >
              <span className="m-sw" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      )}
      {estOpen && (
        <div className="m-scx" role="radiogroup" aria-label="Estimated time">
          {EST_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={est === m}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setEst(est === m ? undefined : m);
                setEstText('');
                inputRef.current?.focus();
              }}
              className={`m-chip m-num ${est === m ? 'on' : ''}`}
            >
              ~{formatDuration(m)}
            </button>
          ))}
          <input
            type="text"
            className="m-in m-num"
            value={estText}
            onChange={(e) => {
              setEstText(e.target.value);
              setEst(parseEstimate(e.target.value) ?? undefined);
            }}
            placeholder="Custom"
            aria-label="Custom estimate, e.g. 50m or 1h 20m"
            aria-invalid={estInvalid}
            enterKeyHint="done"
            style={{ width: 104, flex: 'none', ...(estInvalid ? { borderColor: 'var(--color-error)' } : {}) }}
          />
        </div>
      )}
      <div className="flex items-center" style={{ gap: 8 }}>
        <label className="m-in flex-1" style={{ padding: '0 0 0 14px' }}>
          <span className="m-dot" style={{ background: current?.color || 'var(--color-outline)' }} />
          <AutoGrowTextarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={current ? `Add a task · ${current.name}` : 'Add a task'}
            aria-label="New task"
            enterKeyHint="done"
            className="flex-1 min-w-0 self-stretch py-[11px] pr-3 bg-transparent border-0 outline-none text-[16px] leading-5 text-on-surface placeholder:text-on-surface-variant"
          />
        </label>
        <button
          type="button"
          className={`m-btn sq ${estOpen || est ? '!bg-secondary-container !text-on-secondary-container' : ''}`}
          aria-label={est ? `Estimate ${formatDuration(est)}` : 'Estimate'}
          aria-pressed={estOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEstOpen((o) => !o)}
        >
          {est ? <span className="m-sm m-num">{formatDuration(est)}</span> : <span className="material-symbols-outlined m-ic s">timer</span>}
        </button>
        <button type="submit" className="m-btn pri sq" aria-label="Add task" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()}>
          <span className="material-symbols-outlined m-ic s">arrow_upward</span>
        </button>
      </div>
    </form>
  );

  return (
    <section aria-label={`Checklist for ${dayLabel}`} className={`flex flex-col flex-1 min-h-0 ${peek ? '' : 'animate-fade-in'}`}>
      <div className="flex-1 min-h-0 overflow-y-auto [touch-action:pan-y] m-pill-clear">
        <div className="flex items-center justify-between" style={{ height: 40, padding: '0 16px' }}>
          <span className="m-lbl m-mut">Checklist</span>
          <span className="m-sm m-mut m-num">
            {open} open{left > 0 ? ` · ~${formatDuration(left)} left` : ''}
          </span>
        </div>

        {tasks.length === 0 && (
          <p className="m-sm m-mut" style={{ padding: '8px 16px' }}>
            Nothing to check for {dayLabel}. Add a task below.
          </p>
        )}

        {groups.map((g, gi) => {
          const groupDone = g.items.filter((t) => t.done).length;
          const groupLeft = g.items.reduce((s, t) => s + (t.done ? 0 : t.estMinutes || 0), 0);
          return (
            <div key={g.key} role="group" aria-label={g.name}>
              <div className="flex items-center" style={{ height: 36, padding: '0 16px', marginTop: gi ? 8 : 0, gap: 8 }}>
                <span className="m-sw" style={{ background: g.color }} />
                <span className="m-sm flex-1 min-w-0 truncate" style={{ fontWeight: 600 }}>{g.name}</span>
                <span className="m-sm m-mut m-num">
                  {groupDone}/{g.items.length}{groupLeft > 0 ? ` · ~${formatDuration(groupLeft)}` : ''}
                </span>
              </div>
              {g.items.map(taskRow)}
            </div>
          );
        })}

        {unscheduledTasks.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOther((v) => !v)}
              aria-expanded={showOther}
              className="flex items-center w-full bg-transparent border-0 text-left"
              style={{ height: 40, padding: '0 16px', marginTop: 8, gap: 4 }}
            >
              <span className="m-lbl m-mut">Unscheduled tasks · {unscheduledTasks.length}</span>
              <span className="material-symbols-outlined m-ic xs m-mut">{showOther ? 'expand_more' : 'chevron_right'}</span>
            </button>
            {showOther && unscheduledTasks.map(taskRow)}
          </>
        )}
      </div>

      {!peek && (belowDock ? createPortal(addBar, belowDock) : addBar)}

      {editing && !peek && (
        <ChecklistTaskDialog
          key={editing.id}
          task={editing}
          subjects={subjects}
          dayLabel={dayLabel}
          date={date}
          onSave={(patch) => {
            onEditTask(editing.id, patch);
            setEditingId(null);
          }}
          onMove={(to) => {
            onMoveTask(editing.id, to);
            setEditingId(null);
          }}
          onDelete={() => {
            onDeleteTask(editing.id);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </section>
  );
}
