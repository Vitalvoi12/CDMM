import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { DayTask, Subject } from '../../types';
import { addDays, dateKey, formatDuration } from '../../utils/time';
import { EST_PRESETS, parseEstimate, stepEstimate } from '../../utils/estimate';
import { useEscapeOverlay } from '../../services/overlays';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Sheet } from '../mobile/Sheet';
import { AutoGrowTextarea } from '../common/AutoGrowTextarea';

interface ChecklistTaskDialogProps {
  task: DayTask;
  subjects: Subject[];
  dayLabel: string;
  /** The day the task is on. */
  date: Date;
  /** `estMinutes: undefined` clears the estimate. */
  onSave: (patch: { text: string; subjectId: string; estMinutes: number | undefined }) => void;
  /** Postpone the task to another day ("YYYY-MM-DD"), after saving. Absent = no day picker. */
  onMove?: (to: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Edit one checklist task: rename it, move it to another subject, and set its
 * estimate — a preset or any custom length ("50", "1h 20m", "1:20") — and
 * postpone it to another day.
 *
 * Same keys as the new-task form, in the name field: ↑ / ↓ change the subject,
 * Shift+← / Shift+→ step the estimate, Enter saves, Esc closes.
 */
export function ChecklistTaskDialog({ task, subjects, dayLabel, date, onSave, onMove, onDelete, onClose }: ChecklistTaskDialogProps) {
  const isMobile = useIsMobile();
  const [text, setText] = useState(task.text);
  const [subjectId, setSubjectId] = useState(subjects.some((s) => s.id === task.subjectId) ? task.subjectId : '');
  // The estimate lives as text, so a custom value can be typed freely; presets
  // and keys write their value into it.
  const [estText, setEstText] = useState(task.estMinutes ? formatDuration(task.estMinutes) : '');
  const est = parseEstimate(estText);
  const estInvalid = est === null;
  const canSave = text.trim() !== '' && !estInvalid;
  // The day the task goes to on Save; its own day = stays.
  const today = dateKey(date);
  const [day, setDay] = useState(today);
  const dayChoices = [
    { key: today, name: dayLabel },
    { key: dateKey(addDays(date, 1)), name: 'Tomorrow' },
    { key: dateKey(addDays(date, 7)), name: 'Next week' },
  ];
  const otherDay = !dayChoices.some((c) => c.key === day);

  useEscapeOverlay(onClose);

  const subjectChoices = [{ id: '', name: 'No subject', color: '' }, ...subjects];

  const save = () => {
    if (!canSave) return;
    onSave({ text: text.trim(), subjectId, estMinutes: est ?? undefined });
    if (onMove && day !== today) onMove(day);
  };

  const setEst = (minutes: number | undefined) => setEstText(minutes ? formatDuration(minutes) : '');

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setEst(stepEstimate(est ?? undefined, e.key === 'ArrowRight' ? 1 : -1));
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = subjectChoices.findIndex((s) => s.id === subjectId);
      const n = subjectChoices.length;
      setSubjectId(subjectChoices[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].id);
    }
  };

  const chip = (selected: boolean) =>
    `flex items-center gap-1.5 rounded-full border font-body-sm text-body-sm transition-colors ${
      isMobile ? 'px-3 py-1.5 !text-[14px]' : 'px-2.5 py-1'
    } ${
      selected
        ? 'bg-secondary-container border-secondary-container text-on-secondary-container'
        : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
    }`;
  const label = 'font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]';
  // 16px on the phone: iOS zooms into smaller fields on focus.
  const field = `bg-surface-container-low border focus:border-primary rounded-xl font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 ${
    isMobile ? 'py-3 px-4 !text-[16px]' : 'py-2 px-3'
  }`;

  if (isMobile) {
    return (
      <Sheet label="Edit checklist task" onClose={onClose} focusSelf={false}>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="m-shd">
            <div className="flex flex-col min-w-0">
              <h2 className="m-h2">Edit task</h2>
              <span className="m-sm m-mut">{dayLabel}</span>
            </div>
            <button type="button" className="m-ib" aria-label="Close" onClick={onClose}>
              <span className="material-symbols-outlined m-ic">close</span>
            </button>
          </div>
          <AutoGrowTextarea className="m-in" aria-label="Name" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
          <div className="m-fld">
            <span className="m-lbl m-mut">Subject</span>
            <div className="m-wrap" role="radiogroup" aria-label="Subject">
              {subjectChoices.map((s) => (
                <button key={s.id || '__none__'} type="button" role="radio" aria-checked={subjectId === s.id} onClick={() => setSubjectId(s.id)} className={`m-chip ${subjectId === s.id ? 'on' : ''}`}>
                  {s.color && <span className="m-sw" style={{ background: s.color }} />}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="m-fld">
            <span className="m-lbl m-mut">Est. time</span>
            <div className="m-scx" role="radiogroup" aria-label="Estimate presets">
              <button type="button" role="radio" aria-checked={!estText.trim()} onClick={() => setEst(undefined)} className={`m-chip ${!estText.trim() ? 'on' : ''}`}>None</button>
              {EST_PRESETS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={est === m} onClick={() => setEst(m)} className={`m-chip m-num ${est === m ? 'on' : ''}`}>
                  {formatDuration(m)}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="m-in m-num"
              value={estText}
              onChange={(e) => setEstText(e.target.value)}
              placeholder="Custom, e.g. 50m or 1h 20m"
              aria-label="Custom estimate"
              aria-invalid={estInvalid}
              style={estInvalid ? { borderColor: 'var(--color-error)' } : undefined}
            />
            {estInvalid && <span className="m-sm" style={{ color: 'var(--color-error)' }}>Write it like 45, 45m, 1.5h, 1h 20m or 1:20 (up to 24h)</span>}
          </div>
          {onMove && (
            <div className="m-fld">
              <span className="m-lbl m-mut">Day</span>
              <div className="m-scx" role="radiogroup" aria-label="Day">
                {dayChoices.map((c) => (
                  <button key={c.key} type="button" role="radio" aria-checked={day === c.key} onClick={() => setDay(c.key)} className={`m-chip ${day === c.key ? 'on' : ''}`}>
                    {c.name}
                  </button>
                ))}
              </div>
              <input
                type="date"
                className="m-in m-num"
                aria-label="Other day"
                value={day}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                style={otherDay ? { borderColor: 'var(--color-primary)' } : undefined}
              />
            </div>
          )}
          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className="m-btn err sq" aria-label="Delete task" onClick={onDelete}>
              <span className="material-symbols-outlined m-ic s">delete</span>
            </button>
            <button type="submit" className="m-btn pri flex-1" disabled={!canSave}>{day === today ? 'Save' : 'Save & move'}</button>
          </div>
        </form>
      </Sheet>
    );
  }

  return createPortal(
    <div
      className="overlay-root z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in"
      onClick={onClose}
      // React bubbles portal events to the page behind: keep its day swipe and
      // double tap from seeing touches made in this window.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Edit checklist task"
        className="bg-surface-container-lowest rounded-2xl p-5 shadow-elev-3 w-full max-w-md max-h-full overflow-y-auto flex flex-col gap-4 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md !text-[16px] text-on-surface">
            Edit task <span className="text-on-surface-variant font-normal">· {dayLabel}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[22px] leading-none">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="checklist-task-name" className={label}>Name</label>
          <AutoGrowTextarea
            id="checklist-task-name"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleNameKeyDown}
            enterKeyHint="done"
            className={`w-full border-outline-variant ${field}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>Subject</span>
          <div className={`flex flex-wrap ${isMobile ? 'gap-2' : 'gap-1.5'}`} role="radiogroup" aria-label="Subject">
            {subjectChoices.map((s) => (
              <button
                key={s.id || '__none__'}
                type="button"
                role="radio"
                aria-checked={subjectId === s.id}
                onClick={() => setSubjectId(s.id)}
                className={chip(subjectId === s.id)}
              >
                {s.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />}
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="checklist-task-est" className={label}>Estimated time</label>
          <div className={`flex flex-wrap ${isMobile ? 'gap-2' : 'gap-1.5'}`} role="radiogroup" aria-label="Estimate presets">
            <button type="button" role="radio" aria-checked={!estText.trim()} onClick={() => setEst(undefined)} className={chip(!estText.trim())}>
              None
            </button>
            {EST_PRESETS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={est === m} onClick={() => setEst(m)} className={`${chip(est === m)} tabular-nums`}>
                ~{formatDuration(m)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              id="checklist-task-est"
              type="text"
              value={estText}
              onChange={(e) => setEstText(e.target.value)}
              placeholder="Custom, e.g. 50m or 1h 20m"
              aria-invalid={estInvalid}
              className={`flex-1 min-w-0 tabular-nums ${field} ${estInvalid ? 'border-error' : 'border-outline-variant'}`}
            />
            {est ? (
              <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums flex-shrink-0">= {formatDuration(est)}</span>
            ) : null}
          </div>
          {estInvalid && (
            <p className="font-body-sm text-body-sm text-error">Write it like 45, 45m, 1.5h, 1h 20m or 1:20 (up to 24h)</p>
          )}
        </div>

        {onMove && (
          <div className="flex flex-col gap-2">
            <label htmlFor="checklist-task-day" className={label}>Day</label>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Day">
              {dayChoices.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={day === c.key} onClick={() => setDay(c.key)} className={chip(day === c.key)}>
                  {c.name}
                </button>
              ))}
              <input
                id="checklist-task-day"
                type="date"
                value={day}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                className={`tabular-nums ${field} ${otherDay ? 'border-primary' : 'border-outline-variant'}`}
              />
            </div>
          </div>
        )}

        <p className="max-lg:hidden font-body-sm text-[11px] text-on-surface-variant/70">
          ↑ / ↓ — subject · Shift+← / → — estimate · Enter — save · Esc — close
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDelete}
            className="font-body-md text-body-md text-error hover:opacity-80 transition-opacity px-1"
          >
            Delete
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="ml-auto px-6 py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md uppercase tracking-[0.1em] disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {day === today ? 'Save' : 'Save & move'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
