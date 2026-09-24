import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { SUBJECT_COLOR_GROUPS, DEFAULT_CUSTOM_COLOR } from '../../utils/color';
import { addDays, addMonths, addYears, type RepeatFreq } from '../../utils/time';

export interface EventRecurrence {
  freq: RepeatFreq;
  until: Date;
}

interface EventFormProps {
  event: CalendarEvent | null;
  defaultSubjectId: string;
  defaultDate: Date;
  defaultKind?: 'real' | 'plan';
  subjects: Subject[];
  onSave: (data: {
    subjectId: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    kind: 'real' | 'plan';
    countInStats: boolean;
    recurrence?: EventRecurrence;
    /** Custom (subject-less) event color. Ignored for subject-bound events. */
    color?: string;
  }) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onCancel: () => void;
}

function toLocalInputValue(date: Date, type: 'date' | 'time'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (type === 'date') {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combine(dateVal: string, timeVal: string): Date {
  return new Date(`${dateVal}T${timeVal}`);
}

/** Select value meaning "a free-form plan event, not tied to any subject". */
const CUSTOM_SUBJECT = '__custom__';

export function EventForm({ event, defaultSubjectId, defaultDate, defaultKind = 'plan', subjects, onSave, onDelete, onDuplicate, onCancel }: EventFormProps) {
  const initialStart = event ? new Date(event.start) : new Date(defaultDate);
  const initialEnd = event
    ? new Date(event.end)
    : new Date(initialStart.getTime() + 60 * 60000);

  const initialKind = event?.kind || defaultKind;
  const [subjectSel, setSubjectSel] = useState<string>(() => {
    const sid = event?.subjectId || defaultSubjectId;
    if (sid && subjects.some((s) => s.id === sid)) return sid;
    // Unknown/empty subject: heal into custom mode for plan events,
    // fall back to the first subject for real events (they require one).
    if (initialKind === 'plan') return CUSTOM_SUBJECT;
    return subjects[0]?.id || '';
  });
  const [kind, setKind] = useState<'real' | 'plan'>(initialKind);
  const [countInStats, setCountInStats] = useState(event?.countInStats ?? true);
  const [title, setTitle] = useState(event?.title || '');
  const [color, setColor] = useState(event?.color || DEFAULT_CUSTOM_COLOR);
  const [description, setDescription] = useState(event?.description || '');
  const [startDate, setStartDate] = useState(toLocalInputValue(initialStart, 'date'));
  const [startTime, setStartTime] = useState(toLocalInputValue(initialStart, 'time'));
  const [endDate, setEndDate] = useState(toLocalInputValue(initialEnd, 'date'));
  const [endTime, setEndTime] = useState(toLocalInputValue(initialEnd, 'time'));
  const [repeat, setRepeat] = useState<RepeatFreq>('none');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isNew = !event;

  function defaultUntilFor(freq: RepeatFreq, base: Date): string {
    if (freq === 'daily') return toLocalInputValue(addDays(base, 30), 'date');
    if (freq === 'weekly') return toLocalInputValue(addDays(base, 84), 'date');
    if (freq === 'monthly') return toLocalInputValue(addMonths(base, 12), 'date');
    if (freq === 'yearly') return toLocalInputValue(addYears(base, 5), 'date');
    return '';
  }

  useEffect(() => {
    // Move focus inside the dialog so Enter/Escape/Delete work right away,
    // even if the user hasn't clicked any field yet.
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = combine(startDate, startTime);
    const end = combine(endDate, endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Set date and time');
      return;
    }
    if (end <= start) {
      alert('End time must be after start time');
      return;
    }
    let recurrence: EventRecurrence | undefined;
    if (isNew && repeat !== 'none') {
      if (!repeatUntil) {
        setError('Set repeat end date');
        return;
      }
      const until = new Date(`${repeatUntil}T23:59:59`);
      if (isNaN(until.getTime()) || until < start) {
        setError('Repeat end must be after start');
        return;
      }
      recurrence = { freq: repeat, until };
    }
    const isCustom = kind === 'plan' && subjectSel === CUSTOM_SUBJECT;
    let finalSubjectId: string;
    let finalTitle: string;
    if (isCustom) {
      const t = title.trim();
      if (!t) {
        setError('Enter a title for the custom event');
        return;
      }
      finalSubjectId = '';
      finalTitle = t;
    } else {
      const subject = subjects.find((s) => s.id === subjectSel);
      if (!subject) {
        setError(subjects.length > 0 ? 'Pick a subject' : 'Create a subject first');
        return;
      }
      finalSubjectId = subject.id;
      finalTitle = subject.name;
    }
    onSave({
      subjectId: finalSubjectId,
      title: finalTitle,
      description: description.trim() || undefined,
      start,
      end,
      kind,
      countInStats,
      recurrence,
      color: isCustom ? color : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter' && (!(e.target instanceof HTMLTextAreaElement) || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      formRef.current?.requestSubmit();
    } else if (
      e.key === 'Delete' &&
      event &&
      onDelete &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target instanceof HTMLSelectElement)
    ) {
      // Delete key removes the event only in edit mode and only when not
      // typing in a field (there Delete edits text as usual).
      e.preventDefault();
      e.stopPropagation();
      onDelete(event.id);
    }
  };

  const inputClass =
    'w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60';
  const labelClass =
    'font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-2xl p-6 shadow-elev-3 w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            {event ? 'Edit Event' : 'New Study Event'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Subject
            </label>
            <select
              value={subjectSel}
              onChange={(e) => setSubjectSel(e.target.value)}
              className={`${inputClass} appearance-none cursor-pointer`}
            >
              {kind === 'plan' && (
                <option value={CUSTOM_SUBJECT}>Custom event (no subject)</option>
              )}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {kind === 'plan' && subjectSel === CUSTOM_SUBJECT && (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. Dentist, Gym, Meeting"
                className={inputClass}
              />
            </div>
          )}
          {kind === 'plan' && subjectSel === CUSTOM_SUBJECT && (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                Color
              </label>
              <div className="flex flex-col gap-3">
                {SUBJECT_COLOR_GROUPS.map((group) => (
                  <div key={group.label} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-2">
                      {group.colors.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setColor(c.value)}
                          aria-label={c.label}
                          aria-pressed={color === c.value}
                          className={`w-7 h-7 rounded-full transition-transform ${
                            color === c.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest scale-110' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: c.value }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* real/plan — segmented slider, same visual as the Day/3D/Week row */}
          <div
            className="flex gap-1 border border-outline-variant rounded-full p-1 bg-surface-container-low"
            role="group"
            aria-label="Event kind"
          >
            {(['real', 'plan'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  // Real events must be tied to a subject — leave custom mode.
                  if (k === 'real' && subjectSel === CUSTOM_SUBJECT) {
                    setSubjectSel(subjects[0]?.id || '');
                  }
                }}
                className={`flex-1 py-2 rounded-full font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors ${
                  kind === k
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {k === 'real' ? 'Real' : 'Planned'}
              </button>
            ))}
          </div>
          {/* count in stats — checkbox, on by default */}
          <button
            type="button"
            role="checkbox"
            aria-checked={countInStats}
            onClick={() => setCountInStats((v) => !v)}
            className="flex items-center gap-3 self-start px-1 py-1 group"
          >
            <span
              className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors ${
                countInStats
                  ? 'bg-primary border-primary'
                  : 'border-outline bg-surface-container-low group-hover:border-outline'
              }`}
            >
              {countInStats && (
                <span className="material-symbols-outlined text-[13px] text-on-primary leading-none">
                  check
                </span>
              )}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-[0.16em]">
              Count in stats?
            </span>
          </button>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
          </div>
          {isNew && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className={labelClass}>
                  Repeat
                </label>
                <select
                  value={repeat}
                  onChange={(e) => {
                    const next = e.target.value as RepeatFreq;
                    setRepeat(next);
                    setError(null);
                    if (next !== 'none' && !repeatUntil) {
                      const base = combine(startDate, startTime);
                      const anchor = isNaN(base.getTime()) ? new Date() : base;
                      setRepeatUntil(defaultUntilFor(next, anchor));
                    }
                  }}
                  className={`${inputClass} appearance-none cursor-pointer`}
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                  <option value="yearly">Every year</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>
                  Repeat until
                </label>
                <input
                  type="date"
                  value={repeatUntil}
                  disabled={repeat === 'none'}
                  onChange={(e) => {
                    setRepeatUntil(e.target.value);
                    setError(null);
                  }}
                  className={`${inputClass} disabled:opacity-40`}
                />
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {error}
            </p>
          )}
          <div className="flex gap-3 mt-1">
            {event && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="px-4 py-2.5 bg-error-container text-on-error-container rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            {event && onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(event.id)}
                className="px-4 py-2.5 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
              >
                Duplicate
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
            >
              {event ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
