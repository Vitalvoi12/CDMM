import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { Toggle } from '../common/Toggle';

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
  }) => void;
  onDelete?: (id: string) => void;
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

export function EventForm({ event, defaultSubjectId, defaultDate, defaultKind = 'plan', subjects, onSave, onDelete, onCancel }: EventFormProps) {
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
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startDate, setStartDate] = useState(toLocalInputValue(initialStart, 'date'));
  const [startTime, setStartTime] = useState(toLocalInputValue(initialStart, 'time'));
  const [endDate, setEndDate] = useState(toLocalInputValue(initialEnd, 'date'));
  const [endTime, setEndTime] = useState(toLocalInputValue(initialEnd, 'time'));
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-xl p-6 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
          {event ? 'Edit Event' : 'New Study Event'}
        </h2>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Subject
            </label>
            <select
              value={subjectSel}
              onChange={(e) => setSubjectSel(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none appearance-none transition-colors cursor-pointer"
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
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
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
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
          )}
          <Toggle
            label={kind === 'plan' ? 'Planned' : 'Real'}
            checked={kind === 'plan'}
            onChange={(isPlan) => {
              const next = isPlan ? 'plan' : 'real';
              setKind(next);
              // Real events must be tied to a subject — leave custom mode.
              if (next === 'real' && subjectSel === CUSTOM_SUBJECT) {
                setSubjectSel(subjects[0]?.id || '');
              }
            }}
          />
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setError(null);
                }}
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setError(null);
                }}
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setError(null);
                }}
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setError(null);
                }}
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {error}
            </p>
          )}
          <div className="flex gap-4 mt-2">
            {event && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="px-4 py-2 bg-error-container text-on-error-container rounded font-label-md text-label-md uppercase tracking-widest hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 border border-outline-variant rounded font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-primary text-on-primary rounded font-label-md text-label-md uppercase tracking-widest hover:bg-tertiary-container transition-colors"
            >
              {event ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
