import { useEffect, useMemo, useRef, useState } from 'react';
import type { Subject } from '../../types';
import { useEscapeOverlay } from '../../services/overlays';
import { SUBJECT_COLORS, DEFAULT_CUSTOM_COLOR } from '../../utils/color';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Sheet } from '../mobile/Sheet';
import { eventRepo } from '../../services/repositories';
import { calculateDailyStats } from '../../utils/stats';
import { weeklyGoalProgress } from '../../utils/goals';
import { formatDuration } from '../../utils/time';

interface SubjectPickerModalProps {
  subjects: Subject[];
  /** `custom` is set for a free-form session not tied to any subject. */
  onSelect: (subjectId: string, custom?: { title: string; color: string }) => void;
  onClose: () => void;
}

export function SubjectPickerModal(props: SubjectPickerModalProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileSubjectPicker {...props} /> : <DesktopSubjectPicker {...props} />;
}

/**
 * Phone: a bottom sheet of subject cards (today's time and the weekly goal
 * bar on each), one tap starts the timer; a custom session is typed below.
 */
function MobileSubjectPicker({ subjects, onSelect, onClose }: SubjectPickerModalProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(DEFAULT_CUSTOM_COLOR);
  const trimmed = title.trim();
  const { today, goals } = useMemo(() => {
    const events = eventRepo.getAll();
    return {
      today: calculateDailyStats(events, new Date()).subjectMinutes,
      goals: new Map(weeklyGoalProgress(events, subjects, new Date()).map((g) => [g.subjectId, g])),
    };
  }, [subjects]);

  return (
    <Sheet label="Start a session" onClose={onClose}>
      <div className="m-shd">
        <div className="flex flex-col min-w-0">
          <h2 className="m-h2">Start session</h2>
          <span className="m-sm m-mut">Tap a subject. The timer starts now.</span>
        </div>
        <button type="button" className="m-ib" aria-label="Close" onClick={onClose}>
          <span className="material-symbols-outlined m-ic">close</span>
        </button>
      </div>

      <div className="grid grid-cols-2" style={{ gap: 8 }}>
        {subjects.map((subject) => {
          const goal = goals.get(subject.id);
          const minutes = today[subject.id] || 0;
          return (
            <button
              key={subject.id}
              type="button"
              onClick={() => onSelect(subject.id)}
              className="flex flex-col justify-between text-left"
              style={{ gap: 10, minHeight: 84, padding: '12px 14px', border: '1px solid var(--color-outline-variant)', borderRadius: 12, background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)' }}
            >
              <span className="flex items-center min-w-0 w-full" style={{ gap: 8 }}>
                <span className="m-sw" style={{ background: subject.color }} />
                <span className="font-semibold m-tr">{subject.name}</span>
              </span>
              <span className="flex flex-col w-full" style={{ gap: 5 }}>
                <span className="m-sm m-mut">{minutes > 0 ? `Today ${formatDuration(minutes)}` : goal ? 'Not started today' : 'No weekly goal'}</span>
                {goal && (
                  <span className="m-bar">
                    <i style={{ width: `${Math.min(100, goal.percent)}%`, background: subject.color }} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <form
        className="m-fld"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSelect('', { title: trimmed, color });
        }}
      >
        <label className="m-lbl m-mut" htmlFor="m-custom-session">Custom event</label>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span className="m-in flex-1" style={{ padding: '0 0 0 14px' }}>
            <span className="m-dot" style={{ background: color }} />
            <input
              id="m-custom-session"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gym, Reading, Meeting"
              enterKeyHint="go"
              className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[16px] text-on-surface placeholder:text-on-surface-variant"
            />
          </span>
          <button type="submit" className="m-btn pri sq" aria-label="Start custom session" disabled={!trimmed}>
            <span className="material-symbols-outlined m-ic s">play_arrow</span>
          </button>
        </div>
        <div className="m-scx" role="radiogroup" aria-label="Custom event color">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.label}
              onClick={() => setColor(c.value)}
              className="m-chip sq"
              style={{ background: 'none', border: color === c.value ? '2px solid var(--color-outline)' : 0 }}
            >
              <span className="m-sw" style={{ width: 22, height: 22, background: c.value }} />
            </button>
          ))}
        </div>
      </form>
    </Sheet>
  );
}

function DesktopSubjectPicker({ subjects, onSelect, onClose }: SubjectPickerModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Custom mode swaps the list for a title field and color swatches.
  const [custom, setCustom] = useState(false);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(DEFAULT_CUSTOM_COLOR);
  const trimmed = title.trim();

  useEscapeOverlay(onClose);

  // Focus inside so the list is reachable by keyboard from the first keypress.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="overlay-root z-[100] flex items-center justify-center bg-scrim animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Select subject"
        className="bg-surface-container-lowest rounded-2xl p-6 max-lg:p-5 shadow-elev-3 w-full max-w-sm mx-4 max-h-full overflow-y-auto animate-pop-in focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline-md text-headline-md max-lg:!text-[12px] max-lg:mb-3 text-on-surface mb-5">
          {custom ? 'Custom Session' : 'Select Subject'}
        </h2>
        {custom ? (
          <form
            className="flex flex-col gap-4 max-lg:gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed) onSelect('', { title: trimmed, color });
            }}
          >
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gym, Reading, Meeting"
              aria-label="Session title"
              className="w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60"
            />
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  aria-label={c.label}
                  aria-pressed={color === c.value}
                  title={c.label}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={!trimmed}
              className="w-full py-2.5 max-lg:py-2 max-lg:!text-[8px] bg-primary text-on-primary rounded-full font-label-md text-label-md uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Start
            </button>
          </form>
        ) : (
        <div className="flex flex-col gap-1.5">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => onSelect(subject.id)}
              className="flex items-center gap-4 max-lg:gap-3 px-4 py-3 max-lg:p-2.5 rounded-xl border border-transparent hover:border-outline-variant hover:bg-surface-container transition-colors text-left"
            >
              <div className="w-3 h-3 max-lg:w-2.5 max-lg:h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
              <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface">{subject.name}</span>
            </button>
          ))}
          <button
            onClick={() => setCustom(true)}
            className="flex items-center gap-4 max-lg:gap-3 px-4 py-3 max-lg:p-2.5 rounded-xl border border-dashed border-outline-variant hover:border-outline hover:bg-surface-container transition-colors text-left"
          >
            <span className="material-symbols-outlined text-[14px] max-lg:text-[12px] leading-none w-3 max-lg:w-2.5 flex justify-center text-on-surface-variant">add</span>
            <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface">Custom event</span>
          </button>
        </div>
        )}
        <button
          onClick={custom ? () => setCustom(false) : onClose}
          className="mt-5 max-lg:mt-4 w-full py-2.5 max-lg:py-2 max-lg:!text-[8px] border border-outline-variant rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors uppercase tracking-[0.1em]"
        >
          {custom ? 'Back' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
