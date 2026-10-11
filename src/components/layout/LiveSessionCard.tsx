import { useCallback, useEffect, useState } from 'react';
import { useActiveSession } from '../../hooks/useActiveSession';
import { eventRepo, subjectRepo, tombstoneRepo } from '../../services/repositories';
import { checkpoint } from '../../services/history';
import { subscribeSessionStart, subscribeSessionStartEdit } from '../../services/liveSession';
import { formatTimerDuration, timeFromDate } from '../../utils/time';
import { DEFAULT_CUSTOM_COLOR } from '../../utils/color';
import { SubjectPickerModal } from '../subjects/SubjectPickerModal';
import { SessionStartEditor } from '../study/SessionStartEditor';
import { SessionFinishConfirm } from '../study/SessionFinishConfirm';
import { SessionRatingPrompt } from '../study/SessionRatingPrompt';
import { rateSession } from '../../services/sessionRating';
import { SessionDock, SessionSheet } from '../mobile/SessionDock';

/**
 * The live session panel pinned above Settings in the desktop sidebar, and the
 * only place the session is driven from on a PC: start it, watch it, fix a
 * forgotten start, finish it. The Focus Room tab is gone from the desktop nav,
 * so everything needed has to live here.
 *
 * On the phone the sidebar is hidden, so the calendar's Stat tab (today only)
 * mounts a second copy.
 * Only the sidebar copy answers the keyboard shortcuts (`shortcuts`), so F
 * never opens two pickers at once.
 *
 * On the phone (`variant="dock"`) the same logic drives the session bar
 * pinned above the bottom nav: Start / Finish in the bar, a tap opens the
 * full session sheet with slide-to-finish, and the rating sheet after Finish
 * carries an Undo.
 *
 * Inverse-surface so it stands out in both themes; English labels.
 */
export function LiveSessionCard({ shortcuts = true, variant = 'card' }: { shortcuts?: boolean; variant?: 'card' | 'dock' } = {}) {
  const { isActive, subjectId, title, color, startTime, elapsed, startSession, resumeSession, setStartTime, stopSession } = useActiveSession();
  const [showPicker, setShowPicker] = useState(false);
  const [showStartEditor, setShowStartEditor] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  // Phone: the expanded session sheet.
  const [expanded, setExpanded] = useState(false);
  // The session just saved, waiting for its focus rating. `resume` is what
  // the phone's Undo needs to bring the session back.
  const [rating, setRating] = useState<{
    id: string;
    name: string;
    minutes: number;
    resume: { subjectId: string; title?: string; color?: string; start: string };
  } | null>(null);

  const subject = (subjectId ? subjectRepo.getById(subjectId) : undefined) ?? (title ? { name: title, color: color || DEFAULT_CUSTOM_COLOR } : undefined);

  // F comes from the app shell, which cannot render dialogs itself. Idle: open
  // the subject picker. Running: ask before ending the session — there is only
  // ever one live session per account, so there is nothing to switch to.
  useEffect(() => {
    if (!shortcuts) return;
    return subscribeSessionStart(() => (isActive ? setShowFinishConfirm(true) : setShowPicker(true)));
  }, [isActive, shortcuts]);

  // C opens the start editor while a session runs.
  useEffect(() => {
    if (!isActive || !shortcuts) return;
    return subscribeSessionStartEdit(() => setShowStartEditor(true));
  }, [isActive, shortcuts]);

  /**
   * Close the session and persist it as a real event — the same write the
   * Focus Room did, kept here so finishing works from the sidebar alone.
   */
  const finish = useCallback(() => {
    const event = stopSession();
    if (!event) return;
    checkpoint('Stop session');
    eventRepo.create({
      id: event.id,
      subjectId: event.subjectId,
      title: subject?.name || event.title,
      color: event.color,
      start: event.start,
      end: event.end,
      kind: 'real',
      countInStats: true,
    });
    setExpanded(false);
    setRating({
      id: event.id,
      name: subject?.name || event.title,
      minutes: Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000),
      resume: { subjectId: event.subjectId, title: title || undefined, color: color || undefined, start: event.start },
    });
  }, [stopSession, subject, title, color]);

  /** Phone Undo after Finish: drop the saved event, keep the session running. */
  const undoFinish = useCallback(() => {
    if (!rating) return;
    checkpoint('Undo stop session');
    tombstoneRepo.add('events', rating.id);
    eventRepo.delete(rating.id);
    resumeSession(rating.resume);
    setRating(null);
  }, [rating, resumeSession]);

  const card = variant === 'dock' ? (
    <SessionDock
      active={isActive}
      name={subject?.name || 'Studying'}
      color={subject?.color}
      startTime={startTime}
      elapsed={elapsed}
      onStart={() => setShowPicker(true)}
      onFinish={finish}
      onExpand={() => setExpanded(true)}
    />
  ) : (
    <div
      key={isActive ? 'live' : 'idle'}
      className="rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant px-5 py-4 flex flex-col gap-2 animate-fade-in"
    >
      <span className="font-label-sm text-label-sm tracking-[0.18em] opacity-60">
        {isActive ? 'Live session' : 'Idle'}
      </span>

      {isActive ? (
        <>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 flex-shrink-0">
              <span
                className="absolute w-full h-full rounded-full opacity-40 animate-ping"
                style={{ backgroundColor: subject?.color || 'currentColor' }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: subject?.color || 'currentColor' }}
              />
            </span>
            <span className="font-headline-md text-headline-md truncate">
              {subject?.name || 'Studying'}
            </span>
          </span>

          <span className="font-headline-lg text-headline-lg tabular-nums leading-none">
            {formatTimerDuration(elapsed)}
          </span>

          {/* The forgotten-start fix lives here now, one click from the timer. */}
          <button
            type="button"
            onClick={() => setShowStartEditor(true)}
            title="Change when this session started"
            className="self-start flex items-center gap-1.5 font-label-sm text-label-sm tracking-[0.12em] opacity-70 hover:opacity-100 transition-opacity"
          >
            Started {startTime ? timeFromDate(startTime) : '--:--'}
            <span className="material-symbols-outlined text-[13px] leading-none">edit</span>
          </button>

          <button
            type="button"
            onClick={finish}
            className="mt-1 w-full py-2 rounded-full bg-error-container text-on-error-container font-label-md text-label-md tracking-[0.12em] uppercase hover:opacity-90 transition-opacity"
          >
            Finish
          </button>
        </>
      ) : (
        <>
          <span className="font-body-md text-body-md opacity-70">No active session</span>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="mt-1 w-full py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md tracking-[0.12em] uppercase hover:opacity-90 transition-opacity"
          >
            Start
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      {card}

      {expanded && isActive && (
        <SessionSheet
          name={subject?.name || 'Studying'}
          color={subject?.color}
          startTime={startTime}
          elapsed={elapsed}
          onEditStart={() => setShowStartEditor(true)}
          onFinish={finish}
          onClose={() => setExpanded(false)}
        />
      )}

      {showPicker && (
        <SubjectPickerModal
          subjects={subjectRepo.getAll()}
          onSelect={(id, custom) => {
            setShowPicker(false);
            startSession(id, custom);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showFinishConfirm && isActive && (
        <SessionFinishConfirm
          subjectName={subject?.name || 'Studying'}
          elapsed={elapsed}
          onConfirm={() => {
            setShowFinishConfirm(false);
            finish();
          }}
          onCancel={() => setShowFinishConfirm(false)}
        />
      )}

      {showStartEditor && (
        <SessionStartEditor
          startTime={startTime}
          elapsed={elapsed}
          onApply={(ms) => {
            setStartTime(ms);
            setShowStartEditor(false);
          }}
          onCancel={() => setShowStartEditor(false)}
        />
      )}

      {rating && (
        <SessionRatingPrompt
          subjectName={rating.name}
          minutes={rating.minutes}
          onRate={(value, note) => {
            rateSession(rating.id, value, note);
            setRating(null);
          }}
          onSkip={() => setRating(null)}
          onUndo={variant === 'dock' ? undoFinish : undefined}
        />
      )}
    </>
  );
}