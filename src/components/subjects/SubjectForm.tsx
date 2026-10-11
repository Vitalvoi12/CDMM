import { useState } from 'react';
import type { Subject } from '../../types';
import { SUBJECT_COLORS as COLORS, SUBJECT_COLOR_GROUPS as COLOR_GROUPS } from '../../utils/color';
import { useEscapeOverlay } from '../../services/overlays';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Sheet } from '../mobile/Sheet';

interface SubjectFormProps {
  subject: Subject | null;
  /** `weeklyGoalMinutes` is null when the goal was left empty (clears it). */
  onSave: (data: { name: string; color: string; weeklyGoalMinutes: number | null }) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export function SubjectForm({ subject, onSave, onCancel, onDelete }: SubjectFormProps) {
  const isMobile = useIsMobile();
  const [name, setName] = useState(subject?.name || '');
  const [color, setColor] = useState(subject?.color || COLORS[0].value);
  // Hours per week as typed; '' = no goal.
  const [goalHours, setGoalHours] = useState(() =>
    subject?.weeklyGoalMinutes ? String(Math.round((subject.weeklyGoalMinutes / 60) * 100) / 100) : ''
  );

  useEscapeOverlay(onCancel);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      const hours = Number(goalHours.replace(',', '.'));
      const weeklyGoalMinutes = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : null;
      onSave({ name: name.trim(), color, weeklyGoalMinutes });
    }
  };

  if (isMobile) {
    return (
      <Sheet label={subject ? 'Edit subject' : 'Add subject'} onClose={onCancel} focusSelf={false}>
        <form onSubmit={handleSubmit} className="contents">
          <div className="m-shd">
            <h2 className="m-h2">{subject ? 'Edit subject' : 'Add subject'}</h2>
            <button type="button" className="m-ib" aria-label="Close" onClick={onCancel}>
              <span className="material-symbols-outlined m-ic">close</span>
            </button>
          </div>
          <div className="m-fld">
            <label className="m-lbl m-mut" htmlFor="m-subject-name">Name</label>
            <input id="m-subject-name" type="text" className="m-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject name" autoFocus={!subject} />
          </div>
          <div className="m-fld">
            <label className="m-lbl m-mut" htmlFor="m-subject-goal">Weekly goal</label>
            <div className="flex items-center" style={{ gap: 12 }}>
              <input
                id="m-subject-goal"
                type="number"
                inputMode="decimal"
                min={0}
                max={168}
                step={0.5}
                className="m-in m-num"
                style={{ width: 120 }}
                value={goalHours}
                onChange={(e) => setGoalHours(e.target.value)}
                placeholder="No goal"
              />
              <span className="m-mut">hours / week</span>
            </div>
          </div>
          <div className="m-fld">
            <span className="m-lbl m-mut">Color</span>
            <div className="flex flex-wrap" role="radiogroup" aria-label="Color">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={color === c.value}
                  aria-label={c.label}
                  onClick={() => setColor(c.value)}
                  className="flex items-center justify-center border-0 bg-transparent"
                  style={{ width: 44, height: 44 }}
                >
                  <span
                    className="block rounded-full"
                    style={{ width: 28, height: 28, background: c.value, boxShadow: color === c.value ? '0 0 0 2px var(--color-surface-container-lowest), 0 0 0 4px var(--color-on-surface)' : undefined }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            {subject && onDelete && (
              <button type="button" className="m-btn err sq" aria-label="Delete subject" onClick={() => onDelete(subject.id)}>
                <span className="material-symbols-outlined m-ic s">delete</span>
              </button>
            )}
            <button type="submit" className="m-btn pri flex-1" disabled={!name.trim()}>
              {subject ? 'Save subject' : 'Add subject'}
            </button>
          </div>
        </form>
      </Sheet>
    );
  }

  return (
    <div className="overlay-root z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in" onClick={onCancel}>
      <div
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:p-5 shadow-elev-3 w-full max-w-md mx-4 max-h-full overflow-y-auto animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 max-lg:mb-4">
          <h2 className="font-headline-md text-headline-md max-lg:!text-[13px] text-on-surface">
            {subject ? 'Edit Subject' : 'Add Subject'}
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-lg:gap-4">
          <div className="flex flex-col gap-2">
            <label className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Subject name"
              className="w-full bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:py-2 max-lg:px-3 font-body-md text-body-md max-lg:!text-[10px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="subject-goal" className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
              Weekly goal
            </label>
            <div className="flex items-center gap-3">
              <input
                id="subject-goal"
                type="number"
                inputMode="decimal"
                min={0}
                max={168}
                step={0.5}
                value={goalHours}
                onChange={(e) => setGoalHours(e.target.value)}
                placeholder="No goal"
                className="w-28 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:py-2 max-lg:px-3 font-body-md text-body-md max-lg:!text-[10px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 tabular-nums"
              />
              <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface-variant">hours / week</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.16em]">
              Color
            </label>
            <div className="flex flex-col gap-3">
              {COLOR_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-2.5">
                    {group.colors.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        aria-label={c.label}
                        aria-pressed={color === c.value}
                        className={`w-8 h-8 max-lg:w-7 max-lg:h-7 rounded-full transition-transform ${
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
          <button
            type="submit"
            className="w-full py-3 max-lg:py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md max-lg:!text-[10px] uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
          >
            {subject ? 'Save subject' : 'Add subject'}
          </button>
          {subject && onDelete && (
            <div className="border-t border-outline-variant pt-4">
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] mb-2">
                Danger zone
              </p>
              <button
                type="button"
                onClick={() => onDelete(subject.id)}
                className="font-body-md text-body-md max-lg:!text-[10px] text-error hover:opacity-80 transition-opacity"
              >
                Delete subject
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
