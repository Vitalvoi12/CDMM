import type { CalendarEvent, Subject } from '../../types';
import type { useActiveSession } from '../../hooks/useActiveSession';

interface SubjectPanelProps {
  subject: Subject;
  /** All events, the running session included. */
  events: CalendarEvent[];
  now: number;
  session: ReturnType<typeof useActiveSession>;
  onStartOrFinish: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Desktop Subjects page: the selected subject's details. */
export function SubjectPanel({ subject, onEdit }: SubjectPanelProps) {
  return (
    <aside
      aria-label={subject.name}
      className="flex-[1_1_340px] max-w-[26rem] min-w-0 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-5 flex flex-col gap-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
        <h2 className="font-headline-md text-headline-md text-on-surface truncate flex-1 min-w-0">{subject.name}</h2>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${subject.name}`}
          title="Name, colour and weekly goal"
          className="w-8 h-8 flex items-center justify-center rounded-[0.6rem] border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">edit</span>
        </button>
      </div>
    </aside>
  );
}
