import { useMemo, useState } from 'react';
import type { Subject } from '../../types';
import { formatDuration } from '../../utils/time';
import { formatGoal } from '../../utils/goals';
import { liveSessionEvent, subjectRows } from '../../utils/subjectStats';
import { useActiveSession } from '../../hooks/useActiveSession';
import { requestSessionFinish } from '../../services/liveSession';
import { eventRepo } from '../../services/repositories';
import { SubjectPanel } from './SubjectPanel';

interface SubjectsDesktopProps {
  subjects: Subject[];
  /** Bumped on every repo or sync change, so the numbers are re-read. */
  version: number;
  onAdd: () => void;
  onEdit: (subject: Subject) => void;
  onDelete: (id: string) => void;
}

// Subject · This week · Last studied · Next in plan · start button
const COLUMNS = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_6.4rem_6.6rem_2rem]';

/**
 * Desktop Subjects page: one table of subjects (this week against the goal,
 * when it was last studied, what is next in the plan, a start button) and a
 * panel with the selected subject's details beside it.
 */
export function SubjectsDesktop({ subjects, version, onAdd, onEdit, onDelete }: SubjectsDesktopProps) {
  const session = useActiveSession();
  const { isActive, subjectId: liveId, startTime, elapsed, countInStats, startSession } = session;
  // Recomputed once a minute while a session runs, not on every timer tick.
  const minute = Math.floor(elapsed / 60000);
  const now = startTime ? Date.parse(startTime) + minute * 60000 : Date.now();
  const events = useMemo(() => {
    const live = startTime ? liveSessionEvent({ subjectId: liveId || '', start: startTime, countInStats }, now) : null;
    return live ? [...eventRepo.getAll(), live] : eventRepo.getAll();
    // `version` re-reads the repo after any change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, liveId, countInStats, now, version]);
  const activeLiveId = isActive ? liveId || null : null;
  const rows = useMemo(() => subjectRows(subjects, events, activeLiveId, now), [subjects, events, activeLiveId, now]);

  const weekTotal = subjects.reduce((sum, s) => sum + (rows.get(s.id)?.thisWeek || 0), 0);
  const goalCount = subjects.filter((s) => (s.weeklyGoalMinutes ?? 0) > 0).length;

  // The live subject first, else the first one; a deleted pick falls back too.
  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    subjects.find((s) => s.id === picked) ?? subjects.find((s) => s.id === activeLiveId) ?? subjects[0] ?? null;

  const startOrFinish = (s: Subject) => {
    if (isActive && liveId === s.id) {
      requestSessionFinish();
      return;
    }
    if (isActive) requestSessionFinish();
    startSession(s.id);
  };

  return (
    <div className="flex flex-col w-full gap-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Subjects</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant tabular-nums">
            {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'} · {formatDuration(weekTotal)} this week · {goalCount}{' '}
            {goalCount === 1 ? 'weekly goal' : 'weekly goals'}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 bg-primary hover:opacity-90 transition-opacity text-on-primary pl-4 pr-5 py-2.5 rounded-full font-label-md text-label-md uppercase tracking-[0.1em]"
        >
          <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden="true">add</span>
          Add subject
        </button>
      </header>

      {subjects.length === 0 ? (
        <div className="border border-dashed border-outline-variant rounded-2xl py-14 px-4 flex flex-col items-center justify-center gap-3 text-center">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant opacity-60">layers</span>
          <p className="font-body-md text-body-md text-on-surface-variant">No subjects yet</p>
          <button
            type="button"
            onClick={onAdd}
            className="bg-primary hover:opacity-90 transition-opacity text-on-primary px-5 py-2 rounded-full font-label-md text-label-md uppercase tracking-[0.1em]"
          >
            Add subject
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <section
            aria-label="Subjects"
            className="flex-[3_1_520px] min-w-0 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 overflow-hidden"
          >
            <div className={`grid ${COLUMNS} gap-x-4 items-center px-5 pt-3.5 pb-2.5`}>
              {['Subject', 'This week', 'Last studied', 'Next in plan'].map((h) => (
                <span key={h} className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em] truncate">
                  {h}
                </span>
              ))}
              <span />
            </div>
            {subjects.map((s) => {
              const r = rows.get(s.id);
              const live = activeLiveId === s.id;
              const isSelected = selected?.id === s.id;
              const goal = s.weeklyGoalMinutes ?? 0;
              const week = r?.thisWeek ?? 0;
              const reached = goal > 0 && week >= goal;
              const goLabel = live ? `Finish ${s.name}` : isActive ? `Switch the session to ${s.name}` : `Start ${s.name}`;
              return (
                <div
                  key={s.id}
                  className={`relative grid ${COLUMNS} gap-x-4 items-center min-h-[3.6rem] px-5 border-t border-outline-variant transition-colors ${
                    isSelected ? 'bg-surface-container' : 'hover:bg-surface-container-low'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-[3px]" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPicked(s.id)}
                    aria-pressed={isSelected}
                    className="self-stretch flex items-center gap-2.5 min-w-0 text-left focus:outline-none focus-visible:underline"
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="font-body-md text-body-md font-medium text-on-surface truncate">{s.name}</span>
                    {live && <span className="font-label-sm text-label-sm uppercase tracking-[0.12em] text-now flex-shrink-0">Live</span>}
                  </button>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    {goal > 0 && (
                      <div className="h-1 rounded-full bg-surface-container-high overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (week / goal) * 100)}%`, backgroundColor: s.color }} />
                      </div>
                    )}
                    <span className={`flex items-center gap-1 font-body-sm text-body-sm tabular-nums ${goal > 0 ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                      {goal > 0 ? `${formatDuration(week)} / ${formatGoal(goal)}` : `${formatDuration(week)} · no goal`}
                      {reached && (
                        <span className="material-symbols-outlined text-[13px] leading-none text-success" aria-label="Goal reached">check</span>
                      )}
                    </span>
                  </div>
                  <span className={`font-body-sm text-body-sm tabular-nums truncate ${live ? 'text-now' : 'text-on-surface-variant'}`}>{r?.lastStudied}</span>
                  <span className="font-body-sm text-body-sm tabular-nums text-on-surface-variant truncate">{r?.nextPlanned}</span>
                  <button
                    type="button"
                    onClick={() => startOrFinish(s)}
                    aria-label={goLabel}
                    title={goLabel}
                    className={`w-8 h-8 flex items-center justify-center rounded-[0.6rem] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      live ? 'bg-error-container text-on-error-container' : 'bg-primary text-on-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] leading-none">{live ? 'stop' : 'play_arrow'}</span>
                  </button>
                </div>
              );
            })}
          </section>

          {selected && (
            <SubjectPanel
              key={selected.id}
              subject={selected}
              events={events}
              now={now}
              session={session}
              onStartOrFinish={() => startOrFinish(selected)}
              onEdit={() => onEdit(selected)}
              onDelete={() => onDelete(selected.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
