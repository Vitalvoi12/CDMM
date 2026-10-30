import { useMemo, useState } from 'react';
import type { CalendarEvent, Subject } from '../../types';
import type { useActiveSession } from '../../hooks/useActiveSession';
import { dayTaskRepo } from '../../services/repositories';
import { formatDuration, formatTimerDuration, timeFromDate } from '../../utils/time';
import { formatGoal } from '../../utils/goals';
import { subjectDetail } from '../../utils/subjectStats';
import { StatTile } from '../stats/StatParts';

interface SubjectPanelProps {
  subject: Subject;
  /** All events, the running session included. */
  events: CalendarEvent[];
  now: number;
  session: ReturnType<typeof useActiveSession>;
  onStartOrFinish: () => void;
  onEdit: () => void;
  /** Called after the panel's own confirmation. */
  onDelete: () => void;
}

const CAPTION = 'font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]';

/**
 * Desktop Subjects page: the selected subject — its session, this week
 * against the goal, the last 8 weeks, a few totals, what is planned next,
 * its open checklist tasks, and delete (with a confirmation). Remounted per
 * subject, so a pending confirmation closes when another one is picked.
 */
export function SubjectPanel({ subject, events, now, session, onStartOrFinish, onEdit, onDelete }: SubjectPanelProps) {
  // `events` changes with every repo change, so the checklist is re-read with it.
  const d = useMemo(() => subjectDetail(subject.id, events, dayTaskRepo.getAll(), now), [subject.id, events, now]);
  const [askDelete, setAskDelete] = useState(false);

  const live = session.isActive && session.subjectId === subject.id;
  const goal = subject.weeklyGoalMinutes ?? 0;
  const reached = goal > 0 && d.thisWeek >= goal;
  const max = Math.max(goal, ...d.last8Weeks.map((w) => w.minutes), 1);
  const chartLabel = `Last 8 weeks: ${d.last8Weeks.map((w) => `${w.label} ${formatDuration(w.minutes)}`).join(', ')}${goal > 0 ? `; goal ${formatGoal(goal)}` : ''}`;

  return (
    <aside
      aria-label={subject.name}
      className="flex-[2_1_400px] max-w-[40rem] min-w-0 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-5 flex flex-col gap-5"
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

      {live ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-[0.16em] text-now">Live session</span>
            {session.startTime && (
              <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums">Started {timeFromDate(session.startTime)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onStartOrFinish}
            className="w-full py-2.5 rounded-[0.6rem] bg-error-container text-on-error-container font-label-md text-label-md uppercase tracking-[0.12em] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">stop</span>
            Finish · <span className="tabular-nums">{formatTimerDuration(session.elapsed)}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartOrFinish}
          className="w-full py-2.5 rounded-[0.6rem] bg-primary text-on-primary font-label-md text-label-md uppercase tracking-[0.12em] flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">play_arrow</span>
          {session.isActive ? 'Switch session here' : 'Start session'}
        </button>
      )}

      <section className="flex flex-col gap-2">
        <span className={CAPTION}>This week</span>
        <p className="flex items-baseline gap-1.5">
          <span className="font-headline-lg text-[30px] leading-[34px] text-on-surface tabular-nums">{formatDuration(d.thisWeek)}</span>
          <span className="font-body-md text-body-md text-on-surface-variant tabular-nums">{goal > 0 ? `/ ${formatGoal(goal)} goal` : 'this week'}</span>
        </p>
        {goal > 0 && (
          <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (d.thisWeek / goal) * 100)}%`, backgroundColor: subject.color }} />
          </div>
        )}
        <p className={`font-body-sm text-body-sm tabular-nums ${reached ? 'text-success' : 'text-on-surface-variant'}`}>
          {goal <= 0
            ? 'No weekly goal. Set one with Edit.'
            : reached
            ? 'Goal reached'
            : `${formatDuration(goal - d.thisWeek)} to go · ${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} left`}
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={CAPTION}>Last 8 weeks</span>
          {goal > 0 && (
            <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
              <span className="w-3.5 border-t border-dashed border-on-surface-variant" aria-hidden="true" />
              goal
            </span>
          )}
        </div>
        <div role="img" aria-label={chartLabel} className="relative h-[5.6rem] flex items-end gap-1.5">
          {goal > 0 && (
            <div
              className="absolute inset-x-0 border-t border-dashed border-on-surface-variant opacity-70 pointer-events-none"
              style={{ bottom: `${(goal / max) * 100}%` }}
            />
          )}
          {d.last8Weeks.map((w, i) => (
            <div
              key={w.label + i}
              title={`Week ${w.label.slice(1)}: ${formatDuration(w.minutes)}`}
              className="flex-1 min-h-[2px] rounded-t-[3px]"
              style={{
                height: `${(w.minutes / max) * 100}%`,
                background: i === 7 ? subject.color : `color-mix(in srgb, ${subject.color} 42%, var(--color-surface-dim))`,
              }}
            />
          ))}
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {d.last8Weeks.map((w, i) => (
            <span
              key={w.label + i}
              className={`flex-1 text-center text-[10px] leading-[13px] font-bold tabular-nums ${i === 7 ? 'text-on-surface' : 'text-on-surface-variant'}`}
            >
              {w.label}
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <StatTile value={String(d.sessionsThisWeek)} label="Sessions" hint="this week" />
        <StatTile value={d.avgFocus === null ? '—' : d.avgFocus.toFixed(1)} label="Avg focus" hint="out of 3" />
        <StatTile
          value={formatDuration(d.allTimeMinutes)}
          label="All time"
          hint={d.firstSession ? `since ${d.firstSession.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'no sessions yet'}
        />
      </div>

      <section className="flex flex-col gap-1.5">
        <span className={CAPTION}>Next in plan</span>
        {d.upcoming.length > 0 ? (
          <ul className="flex flex-col">
            {d.upcoming.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-2.5 py-1.5 ${i > 0 ? 'border-t border-outline-variant' : ''}`}>
                <span className="w-[3px] h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: subject.color }} />
                <span className="font-body-md text-body-md text-on-surface tabular-nums w-[4.6rem] flex-shrink-0">{p.day}</span>
                <span className="font-body-md text-body-md text-on-surface-variant tabular-nums flex-1">{p.time}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums">{p.length}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing planned. Drag a block onto the calendar’s Plan column.</p>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className={CAPTION}>Open tasks</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums">{d.openTaskCount}</span>
        </div>
        {d.openTasks.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {d.openTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 py-0.5">
                <span className="w-4 h-4 mt-px rounded-full border border-outline flex-shrink-0" aria-hidden="true" />
                <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0 break-words">{t.text}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant tabular-nums flex-shrink-0 mt-px">{t.day}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No open checklist tasks.</p>
        )}
      </section>

      <div className="border-t border-outline-variant pt-3">
        {askDelete ? (
          <div role="alertdialog" aria-label={`Delete ${subject.name}?`} className="flex flex-col gap-2.5 p-3 rounded-[0.6rem] bg-error-container">
            <p className="font-body-md text-body-md text-on-error-container">
              <b>Delete {subject.name}?</b> Its {d.realCount} logged {d.realCount === 1 ? 'session' : 'sessions'} and {d.planCount} planned{' '}
              {d.planCount === 1 ? 'block' : 'blocks'} stay in the calendar without a subject
              {goal > 0 ? ', and its weekly goal is removed.' : '.'}
            </p>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                autoFocus
                onClick={() => setAskDelete(false)}
                className="px-3 py-1.5 rounded-[0.6rem] font-label-md text-label-md uppercase tracking-[0.1em] text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="px-3 py-1.5 rounded-[0.6rem] font-label-md text-label-md uppercase tracking-[0.1em] bg-error text-on-error hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAskDelete(true)} className="font-body-md text-body-md text-error hover:underline">
            Delete subject…
          </button>
        )}
      </div>
    </aside>
  );
}
