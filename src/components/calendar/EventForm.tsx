import { useState } from 'react';
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

export function EventForm({ event, defaultSubjectId, defaultDate, defaultKind = 'plan', subjects, onSave, onDelete, onCancel }: EventFormProps) {
  const initialStart = event ? new Date(event.start) : new Date(defaultDate);
  const initialEnd = event
    ? new Date(event.end)
    : new Date(initialStart.getTime() + 60 * 60000);

  const [subjectId, setSubjectId] = useState(event?.subjectId || defaultSubjectId);
  const [kind, setKind] = useState<'real' | 'plan'>(event?.kind || defaultKind);
  const [description, setDescription] = useState(event?.description || '');
  const [startDate, setStartDate] = useState(toLocalInputValue(initialStart, 'date'));
  const [startTime, setStartTime] = useState(toLocalInputValue(initialStart, 'time'));
  const [endDate, setEndDate] = useState(toLocalInputValue(initialEnd, 'date'));
  const [endTime, setEndTime] = useState(toLocalInputValue(initialEnd, 'time'));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = combine(startDate, startTime);
    const end = combine(endDate, endTime);
    if (end <= start) {
      alert('End time must be after start time');
      return;
    }
    const subject = subjects.find((s) => s.id === subjectId);
    onSave({
      subjectId,
      title: subject?.name || subjectId,
      description: description.trim() || undefined,
      start,
      end,
      kind,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4" onClick={onCancel}>
      <div
        className="bg-surface-container-lowest rounded-xl p-6 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
          {event ? 'Edit Event' : 'New Study Event'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Subject
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none appearance-none transition-colors cursor-pointer"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <Toggle
            label={kind === 'plan' ? 'Planned' : 'Real'}
            checked={kind === 'plan'}
            onChange={(isPlan) => setKind(isPlan ? 'plan' : 'real')}
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
                onChange={(e) => setStartDate(e.target.value)}
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
                onChange={(e) => setStartTime(e.target.value)}
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
                onChange={(e) => setEndDate(e.target.value)}
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
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
          </div>
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
