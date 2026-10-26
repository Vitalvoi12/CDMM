import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { useEscapeOverlay } from '../../services/overlays';
import { useSheetExit } from '../../hooks/useSheetExit';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { SUBJECT_COLOR_GROUPS, DEFAULT_CUSTOM_COLOR } from '../../utils/color';
import { addDays, addMonths, addYears, type RepeatFreq } from '../../utils/time';
import { NotifyList, isPresetLead, notifySummary, toDateTimeValue, type NotifyItem } from '../common/NotifyList';
import { eventLeads } from '../../services/notifications';
import { FOCUS_LABELS, type FocusRating } from '../../utils/analytics';
import { AutoGrowTextarea } from '../common/AutoGrowTextarea';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Sheet } from '../mobile/Sheet';
import { ExpandRow } from '../mobile/ExpandRow';
import { PickerCard } from '../mobile/PickerCard';

export interface EventRecurrence {
  freq: RepeatFreq;
  until: Date;
}

interface EventFormProps {
  event: CalendarEvent | null;
  defaultSubjectId: string;
  defaultDate: Date;
  /** End for a new event (drag-to-create); defaults to start + 1h. */
  defaultEnd?: Date;
  defaultKind?: 'real' | 'plan';
  /** How the edited event's series repeats now (until = "YYYY-MM-DD" of its last occurrence). Absent = standalone. */
  series?: { freq: RepeatFreq; until: string };
  subjects: Subject[];
  onSave: (data: {
    subjectId: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    kind: 'real' | 'plan';
    countInStats: boolean;
    /**
     * New event: how to repeat it. Existing event: set only when the repeat
     * was changed — it then applies to this and the following occurrences
     * ('none' stops the series here).
     */
    recurrence?: EventRecurrence;
    /** Custom (subject-less) event color. Ignored for subject-bound events. */
    color?: string;
    /** Reminder minutes before start (0 = at start); null = no reminder. */
    notifyBefore: number | null;
    /** Further leads after the first; [] = none. */
    notifyExtra: number[];
    /** Focus rating of a finished session; null = unrated. Absent for new or planned events. */
    focus?: FocusRating | null;
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

/** Select value meaning "a free-form event, not tied to any subject". */
const CUSTOM_SUBJECT = '__custom__';

const REPEAT_LABELS: Record<RepeatFreq, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};
/** Short labels for the phone's repeat chips. */
const REPEAT_CHIPS: Record<RepeatFreq, string> = { none: 'Never', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const FOCUS_ICONS = { 1: 'blur_on', 2: 'adjust', 3: 'target' } as const;

export function EventForm({ event, defaultSubjectId, defaultDate, defaultEnd, defaultKind = 'plan', series, subjects, onSave, onDelete, onDuplicate, onCancel }: EventFormProps) {
  const initialStart = event ? new Date(event.start) : new Date(defaultDate);
  const initialEnd = event
    ? new Date(event.end)
    : defaultEnd
      ? new Date(defaultEnd)
      : new Date(initialStart.getTime() + 60 * 60000);

  const initialKind = event?.kind || defaultKind;
  const [subjectSel, setSubjectSel] = useState<string>(() => {
    const sid = event?.subjectId || defaultSubjectId;
    if (sid && subjects.some((s) => s.id === sid)) return sid;
    // Unknown/empty subject: heal into custom mode.
    return CUSTOM_SUBJECT;
  });
  const [kind, setKind] = useState<'real' | 'plan'>(initialKind);
  const [countInStats, setCountInStats] = useState(event?.countInStats ?? true);
  const [title, setTitle] = useState(event?.title || '');
  const [color, setColor] = useState(event?.color || DEFAULT_CUSTOM_COLOR);
  const [description, setDescription] = useState(event?.description || '');
  const [focus, setFocus] = useState<FocusRating | null>(event?.focus ?? null);
  const [startDate, setStartDate] = useState(toLocalInputValue(initialStart, 'date'));
  const [startTime, setStartTime] = useState(toLocalInputValue(initialStart, 'time'));
  const [endDate, setEndDate] = useState(toLocalInputValue(initialEnd, 'date'));
  const [endTime, setEndTime] = useState(toLocalInputValue(initialEnd, 'time'));
  const [repeat, setRepeat] = useState<RepeatFreq>(series?.freq ?? 'none');
  const [repeatUntil, setRepeatUntil] = useState(series?.until ?? '');
  const [error, setError] = useState<string | null>(null);
  // A custom time is stored as an arbitrary lead before the start, so it
  // moves with the event and applies to every occurrence of a series.
  const [notifyItems, setNotifyItems] = useState<NotifyItem[]>(() =>
    (event ? eventLeads(event) : []).map((lead) =>
      isPresetLead(lead)
        ? { lead, customAt: '' }
        : { lead: null, customAt: toDateTimeValue(new Date(initialStart.getTime() - lead * 60_000)) },
    ),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Phone: the sheet fades out when it closes.
  useSheetExit(overlayRef, dialogRef);
  useSheetDrag(dialogRef, onCancel);

  const isMobile = useIsMobile();
  const isNew = !event;
  const repeatChanged = isNew ? repeat !== 'none' : repeat !== (series?.freq ?? 'none') || (repeat !== 'none' && repeatUntil !== (series?.until ?? ''));

  function defaultUntilFor(freq: RepeatFreq, base: Date): string {
    if (freq === 'daily') return toLocalInputValue(addDays(base, 30), 'date');
    if (freq === 'weekly') return toLocalInputValue(addDays(base, 84), 'date');
    if (freq === 'monthly') return toLocalInputValue(addMonths(base, 12), 'date');
    if (freq === 'yearly') return toLocalInputValue(addYears(base, 5), 'date');
    return '';
  }

  useEscapeOverlay(onCancel);

  useEffect(() => {
    // Move focus inside the dialog so Enter/Delete work right away, even if
    // the user hasn't clicked any field yet. Escape is the overlay stack's job.
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  const changeRepeat = (next: RepeatFreq) => {
    setRepeat(next);
    setError(null);
    if (next !== 'none' && !repeatUntil) {
      const base = combine(startDate, startTime);
      const anchor = isNaN(base.getTime()) ? new Date() : base;
      setRepeatUntil(defaultUntilFor(next, anchor));
    }
  };

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
    const leads: number[] = [];
    for (const item of notifyItems) {
      const lead = item.customAt ? Math.round((start.getTime() - new Date(item.customAt).getTime()) / 60_000) : item.lead;
      if (lead === null) continue;
      if (!Number.isFinite(lead) || lead < 0) {
        setError('Notifications must be before the start');
        return;
      }
      if (!leads.includes(lead)) leads.push(lead);
    }
    let recurrence: EventRecurrence | undefined;
    if (repeatChanged && repeat === 'none') {
      recurrence = { freq: 'none', until: start };
    } else if (repeatChanged) {
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
    const isCustom = subjectSel === CUSTOM_SUBJECT;
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
      notifyBefore: leads[0] ?? null,
      notifyExtra: leads.slice(1),
      ...(!isNew && kind === 'real' ? { focus } : {}),
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
    'w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:px-3 max-lg:min-h-[44px] max-lg:!text-[16px] font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60';
  const labelClass =
    'font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] max-lg:m-lbl';

  if (isMobile) {
    // Phone (the "Edit event" sheet of the mobile design): the times are one
    // row of cards, an end at or before the start runs into the next day.
    const setTimes = (date: string, from: string, to: string) => {
      setStartDate(date);
      setStartTime(from);
      setEndTime(to);
      setEndDate(to <= from ? toLocalInputValue(addDays(new Date(`${date}T00:00`), 1), 'date') : date);
      setError(null);
    };
    const nextDay = endDate > startDate;
    const shortDate = (v: string) => new Date(`${v}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const custom = subjectSel === CUSTOM_SUBJECT;
    const remind = notifySummary(notifyItems);
    return (
      <Sheet label={event ? 'Edit event' : 'New event'} onClose={onCancel} tall>
        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex-1 flex flex-col" style={{ gap: 14 }}>
          <div className="m-shd">
            <h2 className="m-h2">{event ? 'Edit event' : 'New event'}</h2>
            <button type="button" className="m-ib" aria-label="Close" onClick={onCancel}>
              <span className="material-symbols-outlined m-ic">close</span>
            </button>
          </div>

          <div className="m-wrap" role="radiogroup" aria-label="Subject">
            {subjects.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={subjectSel === s.id} className={`m-chip ${subjectSel === s.id ? 'on' : ''}`} onClick={() => { setSubjectSel(s.id); setError(null); }}>
                <span className="m-sw" style={{ background: s.color }} />
                {s.name}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={custom} className={`m-chip ${custom ? 'on' : ''}`} onClick={() => setSubjectSel(CUSTOM_SUBJECT)}>
              <span className="material-symbols-outlined m-ic s m-mut">edit</span>
              Custom
            </button>
          </div>

          {custom && (
            <>
              <label className="m-in">
                <AutoGrowTextarea
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError(null);
                  }}
                  placeholder="Title, e.g. Dentist, Gym"
                  aria-label="Title"
                  className="flex-1 min-w-0 self-stretch py-[11px] bg-transparent border-0 outline-none text-[16px] leading-5 text-on-surface placeholder:text-on-surface-variant"
                />
              </label>
              <div className="m-wrap" role="radiogroup" aria-label="Color">
                {SUBJECT_COLOR_GROUPS.flatMap((g) => g.colors).map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={color === c.value}
                    aria-label={c.label}
                    onClick={() => setColor(c.value)}
                    className="flex items-center justify-center"
                    style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: 'none', padding: 0 }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: c.value, boxShadow: color === c.value ? '0 0 0 2px var(--color-surface-container-lowest), 0 0 0 4px var(--color-primary)' : undefined }} />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="m-seg" role="radiogroup" aria-label="Event kind">
            {(['plan', 'real'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {k === 'plan' ? 'Plan' : 'Real'}
              </button>
            ))}
          </div>

          <div className="flex" style={{ gap: 8 }}>
            <PickerCard className="flex-1 min-w-0" label="Starts" type="time" value={startTime} display={startTime} onChange={(v) => setTimes(startDate, v, endTime)} />
            <PickerCard className="flex-1 min-w-0" label="Ends" type="time" value={endTime} display={endTime} note={nextDay ? '+1 day' : undefined} onChange={(v) => setTimes(startDate, startTime, v)} />
            <PickerCard className="flex-none" label="Date" type="date" value={startDate} display={shortDate(startDate)} onChange={(v) => setTimes(v, startTime, endTime)} />
          </div>

          <button type="button" role="switch" aria-checked={countInStats} onClick={() => setCountInStats((v) => !v)} className="flex items-center justify-between bg-transparent border-0 p-0 text-left text-on-surface" style={{ minHeight: 44 }}>
            <span>Count in stats</span>
            <span className="material-symbols-outlined" style={{ fontSize: 40, width: 40, height: 40, color: countInStats ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>
              {countInStats ? 'toggle_on' : 'toggle_off'}
            </span>
          </button>

          {!isNew && kind === 'real' && (
            <div className="m-fld">
              <span className="m-lbl m-mut">Focus</span>
              <div className="m-seg" role="radiogroup" aria-label="Focus quality">
                {([1, 2, 3] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={focus === r} className={focus === r ? 'on' : ''} onClick={() => setFocus((cur) => (cur === r ? null : r))}>
                    <span className="material-symbols-outlined m-ic s">{FOCUS_ICONS[r]}</span>
                    {FOCUS_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="m-in">
            <AutoGrowTextarea
              multiline
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              aria-label="Notes"
              className="flex-1 min-w-0 self-stretch py-[11px] bg-transparent border-0 outline-none text-[16px] leading-5 text-on-surface placeholder:text-on-surface-variant"
            />
          </label>

          <ExpandRow icon="notifications" text={remind ? `Remind ${remind.charAt(0).toLowerCase()}${remind.slice(1)}` : 'Remind me'} empty={!remind} closedIcon="add">
            <NotifyList
              items={notifyItems}
              onChange={(items) => {
                setNotifyItems(items);
                setError(null);
              }}
              anchor={Number.isFinite(combine(startDate, startTime).getTime()) ? combine(startDate, startTime) : null}
              zeroLabel="At the start"
            />
          </ExpandRow>

          <ExpandRow icon="repeat" text={REPEAT_LABELS[repeat] + (repeat !== 'none' && repeatUntil ? ` until ${shortDate(repeatUntil)}` : '')} empty={repeat === 'none'}>
            <div className="m-scx" role="radiogroup" aria-label="Repeat">
              {(Object.keys(REPEAT_LABELS) as RepeatFreq[]).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={repeat === f} className={`m-chip ${repeat === f ? 'on' : ''}`} onClick={() => changeRepeat(f)}>
                  {REPEAT_CHIPS[f]}
                </button>
              ))}
            </div>
            {repeat !== 'none' && (
              <PickerCard label="Until" type="date" value={repeatUntil} display={repeatUntil ? shortDate(repeatUntil) : 'Pick a day'} onChange={(v) => { setRepeatUntil(v); setError(null); }} />
            )}
            {!isNew && repeatChanged && (
              <p className="m-sm m-mut">
                {repeat === 'none'
                  ? series ? 'The series stops here: later occurrences are removed.' : ''
                  : series ? 'Applies to this and the following occurrences.' : 'Repeats of this event will be added after it.'}
              </p>
            )}
          </ExpandRow>

          {error && (
            <p role="alert" className="m-sm" style={{ color: 'var(--color-error)' }}>
              {error}
            </p>
          )}

          <div className="flex justify-end" style={{ gap: 8, marginTop: 'auto' }}>
            {event && onDelete && (
              <button type="button" className="m-btn err sq" aria-label="Delete event" onClick={() => onDelete(event.id)}>
                <span className="material-symbols-outlined m-ic s">delete</span>
              </button>
            )}
            {event && onDuplicate && (
              <button type="button" className="m-btn sq" aria-label="Duplicate event" onClick={() => onDuplicate(event.id)}>
                <span className="material-symbols-outlined m-ic s">content_copy</span>
              </button>
            )}
            <button type="submit" className="m-btn pri flex-1">
              {event ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </Sheet>
    );
  }

  return (
    // Phone: a bottom sheet over the nav, nearly full height.
    <div ref={overlayRef} className="overlay-root z-[100] flex items-center justify-center max-lg:items-end max-lg:!p-0 max-lg:pt-6 bg-scrim p-4 animate-fade-in" onClick={onCancel}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:!px-4 max-lg:!pt-4 max-lg:pb-[calc(20px+env(safe-area-inset-bottom,0px)/var(--app-zoom))] max-lg:rounded-b-none max-lg:max-w-none max-lg:max-h-[calc(100%-24px)] max-lg:border-t max-lg:border-outline-variant shadow-elev-3 w-full max-w-lg max-h-full overflow-y-auto focus:outline-none animate-pop-in m-sheet-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline-md text-headline-md max-lg:m-h2 text-on-surface">
            {event ? 'Edit Event' : 'New Study Event'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-9 h-9 max-lg:w-[44px] max-lg:h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px] max-lg:!text-[22px]">close</span>
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
              <option value={CUSTOM_SUBJECT}>Custom event (no subject)</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {subjectSel === CUSTOM_SUBJECT && (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                Title
              </label>
              <AutoGrowTextarea
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
          {subjectSel === CUSTOM_SUBJECT && (
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
                onClick={() => setKind(k)}
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
          {/* count in stats — checkbox, on by default. Plans are never part of
              focus time; the flag only removes them from the plan sum that the
              real/plan percentage is computed against. */}
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
          {/* Focus rating of a finished session — set after Finish, fixable here. */}
          {!isNew && kind === 'real' && (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Focus</label>
              <div className="flex gap-1 border border-outline-variant rounded-full p-1 bg-surface-container-low" role="radiogroup" aria-label="Focus quality">
                {([1, 2, 3] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={focus === r}
                    // A second tap on the chosen rating clears it.
                    onClick={() => setFocus((cur) => (cur === r ? null : r))}
                    className={`flex-1 py-2 rounded-full font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors ${
                      focus === r
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {FOCUS_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Description
            </label>
            <AutoGrowTextarea
              multiline
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 min-[481px]:grid-cols-2 min-[481px]:gap-4">
            <div className="flex flex-col gap-2 min-w-0">
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
            <div className="flex flex-col gap-2 min-w-0">
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
            <div className="flex flex-col gap-2 min-w-0">
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
            <div className="flex flex-col gap-2 min-w-0">
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
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className={labelClass}>
                  Repeat
                </label>
                <select
                  value={repeat}
                  onChange={(e) => changeRepeat(e.target.value as RepeatFreq)}
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
            {!isNew && repeatChanged && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {repeat === 'none'
                  ? series ? 'The series stops here: later occurrences are removed.' : ''
                  : series ? 'Applies to this and the following occurrences.' : 'Repeats of this event will be added after it.'}
              </p>
            )}
          </div>
          <NotifyList
            items={notifyItems}
            onChange={(items) => {
              setNotifyItems(items);
              setError(null);
            }}
            anchor={Number.isFinite(combine(startDate, startTime).getTime()) ? combine(startDate, startTime) : null}
            zeroLabel="At the start"
          />
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
                className="max-lg:min-h-[44px] px-4 py-2.5 bg-error-container text-on-error-container rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            )}
            {event && onDuplicate && (
              <button
                type="button"
                onClick={() => onDuplicate(event.id)}
                className="max-lg:min-h-[44px] px-4 py-2.5 border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
              >
                Duplicate
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
              {event ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
