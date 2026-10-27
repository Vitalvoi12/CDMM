import { useMemo } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import { countsTowardStats, liveEventForDate } from '../../utils/stats';
import { addDays, formatDuration, startOfWeek } from '../../utils/time';
import { formatGoal } from '../../utils/goals';
import { useActiveSession } from '../../hooks/useActiveSession';
import { requestSessionFinish } from '../../services/liveSession';
import { eventRepo } from '../../services/repositories';
import { undo, undoLabel } from '../../services/history';

interface SubjectListProps {
  subjects: Subject[];
  onEdit: (subject: Subject) => void;
  onAdd: () => void;
}

/** Real focus minutes per subject in this Monday–Sunday week (running session included). */
function weekMinutes(events: CalendarEvent[], now: number): Map<string, number> {
  const from = startOfWeek(new Date(now)).getTime();
  const to = addDays(new Date(from), 7).getTime();
  const out = new Map<string, number>();
  for (const e of events) {
    if (!countsTowardStats(e)) continue;
    const s = Math.max(from, Date.parse(e.start));
    const en = Math.min(to, Date.parse(e.end));
    if (en > s) out.set(e.subjectId, (out.get(e.subjectId) || 0) + Math.round((en - s) / 60000));
  }
  return out;
}

/**
 * The phone's Subjects page: one row per subject with this week's time
 * against its goal, an edit button and a big start button. The running
 * subject's button finishes it instead; starting another subject finishes
 * the running one first (there is only ever one live session).
 */
export function SubjectList({ subjects, onEdit, onAdd }: SubjectListProps) {
  const { isActive, subjectId: liveId, startTime, elapsed, countInStats, startSession } = useActiveSession();
  const minute = Math.floor(elapsed / 60000);
  const minutes = useMemo(() => {
    const now = startTime ? Date.parse(startTime) + minute * 60000 : Date.now();
    const live = startTime ? liveEventForDate({ subjectId: liveId || '', start: startTime, countInStats }, new Date(now), now) : null;
    return weekMinutes(live ? [...eventRepo.getAll(), live] : eventRepo.getAll(), now);
  }, [startTime, liveId, countInStats, minute]);
  const undoName = undoLabel();

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <header className="m-hdr" style={{ paddingLeft: 16 }}>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="m-lbl m-mut">Curriculum</span>
          <h1 className="m-h1">Subjects</h1>
        </div>
        <button type="button" className="m-ib" aria-label={undoName ? `Undo: ${undoName.toLowerCase()}` : 'Undo'} disabled={!undoName} onClick={() => undo()}>
          <span className="material-symbols-outlined m-ic">undo</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ marginTop: 8, paddingBottom: 84 }}>
        {subjects.length === 0 && (
          <p className="m-sm m-mut" style={{ padding: '8px 16px' }}>No subjects yet. Add one with +.</p>
        )}
        {subjects.map((s) => {
          const live = isActive && liveId === s.id;
          const week = minutes.get(s.id) || 0;
          const goal = s.weeklyGoalMinutes || 0;
          return (
            <div key={s.id} className="flex items-center border-b border-outline-variant" style={{ gap: 6, minHeight: 84, padding: '0 8px 0 16px' }}>
              <span className="self-stretch flex-none" style={{ width: 4, margin: '14px 0', borderRadius: 2, background: s.color }} />
              <button
                type="button"
                onClick={() => onEdit(s)}
                className="flex flex-col flex-1 min-w-0 text-left bg-transparent border-0 text-inherit"
                style={{ gap: 6, padding: '10px 0 10px 6px' }}
              >
                <span className="flex items-center min-w-0 font-semibold" style={{ gap: 6 }}>
                  <span className="m-tr">{s.name}</span>
                  {live && <span className="m-lbl flex-none" style={{ color: 'var(--color-now)' }}>Live</span>}
                </span>
                {goal > 0 && (
                  <span className="m-bar w-full">
                    <i style={{ width: `${Math.min(100, (week / goal) * 100)}%`, background: s.color }} />
                  </span>
                )}
                <span className="m-sm m-mut m-num">
                  {goal > 0 ? `${formatDuration(week)} of ${formatGoal(goal)} this week` : `No weekly goal · ${formatDuration(week)} this week`}
                </span>
              </button>
              <button type="button" className="m-ib" aria-label={`Edit ${s.name}`} onClick={() => onEdit(s)}>
                <span className="material-symbols-outlined m-ic s">edit</span>
              </button>
              <button
                type="button"
                aria-label={live ? `Finish ${s.name}` : isActive ? `Switch the session to ${s.name}` : `Start ${s.name}`}
                onClick={() => {
                  if (live) {
                    requestSessionFinish();
                    return;
                  }
                  if (isActive) requestSessionFinish();
                  startSession(s.id);
                }}
                className="flex items-center justify-center flex-none border-0"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 9.6,
                  background: live ? 'var(--color-error-container)' : 'var(--color-primary)',
                  color: live ? 'var(--color-on-error-container)' : 'var(--color-on-primary)',
                }}
              >
                <span className="material-symbols-outlined m-ic l">{live ? 'stop' : 'play_arrow'}</span>
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" className="m-fab" aria-label="Add subject" onClick={onAdd}>
        <span className="material-symbols-outlined m-ic l">add</span>
      </button>
    </div>
  );
}
