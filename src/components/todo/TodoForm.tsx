import { useEffect, useRef, useState } from 'react';
import type { TodoReminder, TodoTask } from '../../types';
import { useEscapeOverlay } from '../../services/overlays';
import { useSheetExit } from '../../hooks/useSheetExit';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { addDays, formatDuration } from '../../utils/time';
import { parseEstimate } from '../../utils/estimate';
import { Toggle } from '../common/Toggle';
import { NotifyList, notifySummary, toDateTimeValue, type NotifyItem } from '../common/NotifyList';
import { AutoGrowTextarea } from '../common/AutoGrowTextarea';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Sheet } from '../mobile/Sheet';
import { ExpandRow } from '../mobile/ExpandRow';

/** Phone estimate chips (minutes). */
const EST_CHIPS = [15, 30, 60, 120];

interface TodoFormProps {
  task: TodoTask | null;
  defaults: { important: boolean; urgent: boolean };
  onSave: (data: {
    title: string;
    description?: string;
    important: boolean;
    urgent: boolean;
    dueDate?: string;
    /** False when only a day was picked (the stored time is then 18:00). */
    dueHasTime: boolean;
    estMinutes?: number;
    /** Reminder moments; [] clears them. */
    reminders: TodoReminder[];
  }) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
}

function toInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** What preset leads count back from: the due time, or 9:00 on the due day. */
function dueAnchor(dueDate: string, dueTime: string): Date | null {
  if (!dueDate) return null;
  const anchor = new Date(`${dueDate}T${dueTime || '09:00'}`);
  return Number.isFinite(anchor.getTime()) ? anchor : null;
}

/** When a row fires: its custom moment, else its lead before the anchor. */
function reminderMoment(anchor: Date | null, item: NotifyItem): Date | null {
  if (item.customAt) return new Date(item.customAt);
  if (!anchor || item.lead === null) return null;
  return new Date(anchor.getTime() - item.lead * 60_000);
}

export function TodoForm({ task, defaults, onSave, onDelete, onCancel }: TodoFormProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [important, setImportant] = useState(task?.important ?? defaults.important);
  const [urgent, setUrgent] = useState(task?.urgent ?? defaults.urgent);
  // A new task is due today unless another day is picked.
  const [dueDate, setDueDate] = useState(() =>
    task ? toInputValue(task.dueDate) : toInputValue(new Date().toISOString())
  );
  const [dueTime, setDueTime] = useState(() => {
    if (!task?.dueDate || !task.dueHasTime) return '';
    return toDateTimeValue(new Date(task.dueDate)).slice(11);
  });
  const [estInput, setEstInput] = useState(task?.estMinutes ? String(task.estMinutes) : '');
  // A custom reminder is stored as a moment with no lead.
  const [notifyItems, setNotifyItems] = useState<NotifyItem[]>(() =>
    (task?.reminders ?? []).map((r) =>
      r.lead != null ? { lead: r.lead, customAt: '' } : { lead: null, customAt: toDateTimeValue(new Date(r.at)) },
    ),
  );
  const anchor = dueAnchor(dueDate, dueTime);
  const moments = notifyItems.map((item) => reminderMoment(anchor, item));
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Phone: the sheet fades out when it closes.
  useSheetExit(overlayRef, dialogRef);
  useSheetDrag(dialogRef, onCancel);
  const formRef = useRef<HTMLFormElement>(null);
  const isMobile = useIsMobile();
  // Phone: the Custom estimate chip turns into a field while typing.
  const [estEditing, setEstEditing] = useState(false);

  useEscapeOverlay(onCancel);

  useEffect(() => {
    if (task) {
      // Edit mode: focus the dialog itself so Enter/Delete work right away;
      // click into a field to edit text. Escape is the overlay stack's job.
      dialogRef.current?.focus({ preventScroll: true });
    } else {
      titleRef.current?.focus();
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (urgent && !dueDate) {
      setError('Set date');
      return;
    }
    // Empty / non-numeric / zero clears the estimate rather than storing 0.
    const parsedEst = Number.parseInt(estInput, 10);
    const estMinutes = Number.isFinite(parsedEst) && parsedEst > 0 ? parsedEst : undefined;
    onSave({
      title: trimmed,
      description: description.trim() || undefined,
      important,
      urgent,
      dueDate: dueDate ? new Date(`${dueDate}T${dueTime || '18:00'}:00`).toISOString() : undefined,
      dueHasTime: !!(dueDate && dueTime),
      estMinutes,
      reminders: notifyItems.flatMap((item, i) => {
        const at = moments[i];
        if (!at || !Number.isFinite(at.getTime())) return [];
        return [item.customAt ? { at: at.toISOString() } : { at: at.toISOString(), lead: item.lead! }];
      }),
    });
  };

  // Escape is handled centrally by the overlay stack, so this only has Enter
  // and Delete. See services/overlays.ts.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (!(e.target instanceof HTMLTextAreaElement) || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      formRef.current?.requestSubmit();
    } else if (
      e.key === 'Delete' &&
      task &&
      onDelete &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target instanceof HTMLSelectElement)
    ) {
      // Delete key removes the task only in edit mode and only when not
      // typing in a field (there Delete edits text as usual).
      e.preventDefault();
      e.stopPropagation();
      onDelete(task.id);
    }
  };

  if (isMobile) {
    // Phone (the "Edit task" sheet of the mobile design): the due day is a
    // row of chips, a tap on the chosen one clears it.
    const dayValue = (d: Date) => toInputValue(d.toISOString());
    const today = new Date();
    const presets = [
      { label: 'Today', value: dayValue(today) },
      { label: 'Tomorrow', value: dayValue(addDays(today, 1)) },
      // The coming Saturday (today, on a Saturday).
      { label: 'Weekend', value: dayValue(addDays(today, (6 - today.getDay() + 7) % 7)) },
    ];
    const otherDay = dueDate && !presets.some((p) => p.value === dueDate);
    const pickDay = (v: string) => {
      setDueDate(v);
      if (!v) setDueTime('');
      else setError(null);
    };
    const estMinutes = Number.parseInt(estInput, 10) || 0;
    const customEst = estMinutes > 0 && !EST_CHIPS.includes(estMinutes);
    const remind = notifySummary(notifyItems, 'At due time');
    const chipText = 'flex-1 min-w-0 self-stretch py-[11px] bg-transparent border-0 outline-none text-[16px] leading-5 text-on-surface placeholder:text-on-surface-variant';
    return (
      <Sheet label={task ? 'Edit task' : 'New task'} onClose={onCancel} tall focusSelf={!!task}>
        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex-1 flex flex-col" style={{ gap: 14 }}>
          <div className="m-shd">
            <h2 className="m-h2">{task ? 'Edit task' : 'New task'}</h2>
            <button type="button" className="m-ib" aria-label="Close" onClick={onCancel}>
              <span className="material-symbols-outlined m-ic">close</span>
            </button>
          </div>

          <label className="m-in">
            <AutoGrowTextarea ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" aria-label="Title" className={chipText} />
          </label>
          <label className="m-in">
            <AutoGrowTextarea multiline value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" aria-label="Notes" className={chipText} />
          </label>

          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className={`m-chip flex-1 justify-center ${important ? 'on' : ''}`} aria-pressed={important} onClick={() => setImportant((v) => !v)}>
              <span className="material-symbols-outlined m-ic s">flag</span>Important
            </button>
            <button
              type="button"
              className={`m-chip flex-1 justify-center ${urgent ? 'on' : ''}`}
              aria-pressed={urgent}
              onClick={() => {
                setUrgent((v) => !v);
                setError(null);
              }}
            >
              <span className="material-symbols-outlined m-ic s">bolt</span>Urgent
            </button>
          </div>

          <div className="m-fld">
            <span className="m-lbl m-mut">
              Due date{urgent && <span style={{ color: 'var(--color-error)' }}> *</span>}
            </span>
            <div className="m-scx" role="radiogroup" aria-label="Due date">
              {presets.map((p) => (
                <button key={p.label} type="button" role="radio" aria-checked={dueDate === p.value} className={`m-chip ${dueDate === p.value ? 'on' : ''}`} onClick={() => pickDay(dueDate === p.value ? '' : p.value)}>
                  {p.label}
                </button>
              ))}
              <label className={`m-chip relative ${otherDay ? 'on' : 'sq'}`} aria-label="Pick a date">
                {otherDay ? new Date(`${dueDate}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : <span className="material-symbols-outlined m-ic s">event</span>}
                <input type="date" value={dueDate} onChange={(e) => pickDay(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 text-[16px]" />
              </label>
            </div>
          </div>

          <div className="m-fld">
            <div className="flex items-center justify-between">
              <span className="m-lbl m-mut">Time</span>
              {dueTime && (
                <button type="button" className="m-lbl bg-transparent border-0" style={{ color: 'var(--color-primary)', height: 24 }} onClick={() => setDueTime('')}>
                  Clear
                </button>
              )}
            </div>
            <label className={`m-in relative justify-between ${dueDate ? '' : 'opacity-40'}`}>
              <span className="flex items-center" style={{ gap: 10 }}>
                <span className="material-symbols-outlined m-ic s m-mut">schedule</span>
                <span className={dueTime ? 'm-num' : 'm-mut'}>{dueTime || (dueDate ? 'No time' : 'Pick a due date first')}</span>
              </span>
              <span className="material-symbols-outlined m-ic s m-mut">expand_more</span>
              <input type="time" value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} aria-label="Time" className="absolute inset-0 w-full h-full opacity-0 text-[16px]" />
            </label>
          </div>

          <div className="m-fld">
            <span className="m-lbl m-mut">Est. time</span>
            <div className="m-scx" role="radiogroup" aria-label="Estimated time">
              {EST_CHIPS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={estMinutes === m} className={`m-chip m-num ${estMinutes === m ? 'on' : ''}`} onClick={() => setEstInput(estMinutes === m ? '' : String(m))}>
                  {formatDuration(m)}
                </button>
              ))}
              {estEditing ? (
                <span className="m-chip on" style={{ padding: '0 10px' }}>
                  <input
                    autoFocus
                    inputMode="text"
                    defaultValue={customEst ? String(estMinutes) : ''}
                    placeholder="1h20"
                    aria-label="Custom estimate"
                    className="bg-transparent border-0 outline-none text-[16px] text-on-surface"
                    style={{ width: 64 }}
                    onBlur={(e) => {
                      const m = parseEstimate(e.target.value);
                      if (m) setEstInput(String(m));
                      setEstEditing(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </span>
              ) : (
                <button type="button" className={`m-chip ${customEst ? 'on m-num' : 'sq'}`} aria-label="Custom estimate" onClick={() => setEstEditing(true)}>
                  {customEst ? formatDuration(estMinutes) : <span className="material-symbols-outlined m-ic s">edit</span>}
                </button>
              )}
            </div>
          </div>

          <ExpandRow icon="notifications" text={remind ? `Remind ${remind.charAt(0).toLowerCase()}${remind.slice(1)}` : 'Remind me'} empty={!remind} closedIcon="add">
            <NotifyList
              items={notifyItems}
              onChange={setNotifyItems}
              anchor={anchor}
              zeroLabel="At due time"
              noAnchorHint="No due date — pick a custom time, or set a due date for the other options."
            />
            {dueDate && !dueTime && notifyItems.some((item) => !item.customAt) && <p className="m-sm m-mut">No time set — counts from 9:00 on the due day.</p>}
            {moments.some((m) => m !== null && m.getTime() <= Date.now()) && (
              <p className="m-sm m-mut">{moments.length > 1 ? 'Some of these times have passed — those will not show.' : 'This time has passed — the reminder will not show.'}</p>
            )}
          </ExpandRow>

          {error && (
            <p role="alert" className="m-sm" style={{ color: 'var(--color-error)' }}>
              {error}
            </p>
          )}

          <div className="flex" style={{ gap: 8, marginTop: 'auto' }}>
            {task && onDelete && (
              <button type="button" className="m-btn err sq" aria-label="Delete task" onClick={() => onDelete(task.id)}>
                <span className="material-symbols-outlined m-ic s">delete</span>
              </button>
            )}
            <button type="submit" className="m-btn pri flex-1" disabled={!title.trim()}>
              {task ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </Sheet>
    );
  }

  return (
    <div
      // Phone: a bottom sheet over the nav, nearly full height.
      ref={overlayRef}
      className="overlay-root z-[100] flex items-center justify-center max-lg:items-end max-lg:!p-0 bg-scrim p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit task' : 'New task'}
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:!px-4 max-lg:!pt-4 max-lg:pb-[calc(20px+env(safe-area-inset-bottom,0px)/var(--app-zoom))] max-lg:rounded-b-none max-lg:max-w-none max-lg:max-h-[calc(100%-24px)] max-lg:border-t max-lg:border-outline-variant shadow-elev-3 w-full max-w-lg max-h-full overflow-y-auto focus:outline-none animate-pop-in m-sheet-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="font-headline-md text-headline-md max-lg:m-h2 text-on-surface mb-6 max-lg:mb-4">
          {task ? 'Edit Task' : 'New Task'}
        </h2>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="todo-title" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] max-lg:m-lbl">
              Title
            </label>
            <AutoGrowTextarea
              id="todo-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:min-h-[44px] max-lg:!text-[16px] font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="todo-desc" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] max-lg:m-lbl">
              Description
            </label>
            <AutoGrowTextarea
              multiline
              id="todo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              rows={3}
              className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:min-h-[44px] max-lg:!text-[16px] font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Important" checked={important} onChange={setImportant} />
            <Toggle
              label="Urgent"
              checked={urgent}
              onChange={(v) => {
                setUrgent(v);
                if (!v) setError(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
              <div className="flex flex-col gap-2 min-w-0">
                <label htmlFor="todo-due" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] max-lg:m-lbl">
                  Due Date{urgent && <span className="text-error"> *</span>}
                </label>
                <input
                  id="todo-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    if (e.target.value) setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  className={`w-full min-w-0 bg-surface-container-low border rounded-xl py-2.5 px-4 max-lg:min-h-[44px] max-lg:!text-[16px] max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors ${error ? 'border-error focus:border-error' : 'border-outline-variant focus:border-primary'}`}
                />
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="todo-time" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] max-lg:m-lbl">
                    Time
                  </label>
                  {dueTime && (
                    <button
                      type="button"
                      onClick={() => setDueTime('')}
                      className="font-label-sm text-label-sm text-primary uppercase tracking-[0.1em]"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="todo-time"
                  type="time"
                  value={dueTime}
                  disabled={!dueDate}
                  // iOS "Reset" empties the field, which simply means no time.
                  onChange={(e) => setDueTime(e.target.value)}
                  title={dueDate ? undefined : 'Pick a due date first'}
                  className="w-full min-w-0 bg-surface-container-low border rounded-xl py-2.5 px-4 max-lg:min-h-[44px] max-lg:!text-[16px] max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors border-outline-variant focus:border-primary disabled:opacity-40"
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="font-body-sm text-body-sm text-error">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <label htmlFor="todo-est" className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] max-lg:m-lbl">
              Est. Time
            </label>
            <input
              id="todo-est"
              type="number"
              inputMode="numeric"
              min={5}
              step={5}
              max={1440}
              value={estInput}
              onChange={(e) => setEstInput(e.target.value)}
              placeholder="e.g. 45"
              className="w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:min-h-[44px] max-lg:!text-[16px] font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
            />
            {estHint(estInput) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">{estHint(estInput)}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <NotifyList
              items={notifyItems}
              onChange={setNotifyItems}
              anchor={anchor}
              zeroLabel="At due time"
              noAnchorHint="No due date — pick a custom time, or set a due date for the other options."
            />
            {dueDate && !dueTime && notifyItems.some((item) => !item.customAt) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">No time set — counts from 9:00 on the due day.</p>
            )}
            {moments.some((m) => m !== null && m.getTime() <= Date.now()) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {moments.length > 1 ? 'Some of these times have passed — those will not show.' : 'This time has passed — the reminder will not show.'}
              </p>
            )}
          </div>
          <div className="flex gap-3 mt-1">
            {task && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="max-lg:min-h-[44px] px-4 py-2.5 bg-error-container text-on-error-container rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="max-lg:min-h-[44px] flex-1 py-2.5 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="max-lg:min-h-[44px] flex-1 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
            >
              {task ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Live readout of the estimate, so "90" reads as 1h 30m instead of a bare number. */
function estHint(raw: string): string | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatDuration(n);
}
